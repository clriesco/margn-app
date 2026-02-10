#!/usr/bin/env ts-node

/**
 * Daily portfolio check job
 * Verifies leverage status, generates alerts, and checks contribution days
 *
 * Run manually: npx ts-node daily-check.ts
 * Or via cron: 0 8 * * * cd /path/to/scripts && npx ts-node daily-check.ts
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

// ============================================
// TYPES
// ============================================

interface PortfolioState {
  portfolioId: string;
  portfolioName: string;
  userEmail: string;
  equity: number;
  exposure: number;
  leverage: number;
  marginRatio: number;
  leverageMin: number;
  leverageMax: number;
  leverageStatus: "low" | "in_range" | "high";
  isContributionDay: boolean;
  pendingContributions: number;
  alerts: Alert[];
  borrowedAmount: number | null;
}

interface Alert {
  type:
    | "contribution_due"
    | "leverage_low"
    | "leverage_high"
    | "margin_warning";
  priority: "low" | "medium" | "high" | "urgent";
  message: string;
  actionRequired: boolean;
}

interface DailyCheckResult {
  date: string;
  portfoliosChecked: number;
  alertsGenerated: number;
  portfolioStates: PortfolioState[];
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get latest prices for assets
 */
async function getLatestPrices(
  assetIds: string[]
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  for (const assetId of assetIds) {
    const latestPrice = await prisma.assetPrice.findFirst({
      where: { assetId },
      orderBy: { date: "desc" },
    });

    if (latestPrice) {
      prices[assetId] = latestPrice.close;
    }
  }

  return prices;
}

/**
 * Calculate current portfolio state
 */
async function calculatePortfolioState(
  portfolio: any
): Promise<PortfolioState | null> {
  // Get positions
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId: portfolio.id },
    include: { asset: true },
  });

  if (positions.length === 0) {
    return null;
  }

  // Get latest prices
  const latestPrices = await getLatestPrices(positions.map((p) => p.assetId));

  // Calculate exposure
  let exposure = 0;
  for (const pos of positions) {
    const price = latestPrices[pos.assetId] || pos.avgPrice;
    exposure += pos.quantity * price;
  }

  // Get equity from latest metrics or calculate estimate
  // IMPORTANT: The equity in latestMetric already includes contributions up to that point
  // We need to:
  // 1. Start from the metric's equity (which includes contributions)
  // 2. Adjust for price movements: new_equity_from_prices - old_equity_from_prices
  // 3. Add new contributions made since the metric
  let equity = portfolio.initialCapital;
  let borrowedAmount: number | null = null;

  const latestMetric = await prisma.metricsTimeseries.findFirst({
    where: { portfolioId: portfolio.id },
    orderBy: { date: "desc" },
    select: {
      equity: true,
      exposure: true,
      borrowedAmount: true,
      updatedAt: true, // Get exact timestamp when metric was last updated
    },
  });

  if (latestMetric) {
    borrowedAmount = latestMetric.borrowedAmount;

    // Get contributions made AFTER the metric was last updated
    const contributions = await prisma.monthlyContribution.findMany({
      where: {
        portfolioId: portfolio.id,
        contributedAt: {
          gt: latestMetric.updatedAt, // Greater than metric updatedAt (full timestamp comparison)
        },
      },
    });

    const contributionsSinceLastMetric = contributions.reduce(
      (sum: number, c: any) => sum + (c.type === "withdrawal" ? -c.amount : c.amount),
      0
    );

    // Equity from price movements at the time of the metric
    const oldEquityFromPrices = latestMetric.exposure - (borrowedAmount || 0);

    // Equity from price movements now
    const newEquityFromPrices = exposure - (borrowedAmount || 0);

    // Change in equity due to price movements
    const equityChangeFromPrices = newEquityFromPrices - oldEquityFromPrices;

    // Final equity = metric equity + price changes + new contributions
    equity =
      latestMetric.equity +
      equityChangeFromPrices +
      contributionsSinceLastMetric;
  } else {
    // No previous metrics, estimate using target leverage
    const targetLeverage =
      portfolio.leverageTarget ||
      (portfolio.leverageMin + portfolio.leverageMax) / 2;
    equity = exposure / targetLeverage;
    borrowedAmount = exposure - equity;
  }

  // Calculate leverage and margin
  const leverage = equity > 0 ? exposure / equity : 0;
  const marginRatio = exposure > 0 ? equity / exposure : 1;

  // Determine leverage status
  let leverageStatus: "low" | "in_range" | "high" = "in_range";
  if (leverage < portfolio.leverageMin) {
    leverageStatus = "low";
  } else if (leverage > portfolio.leverageMax) {
    leverageStatus = "high";
  }

  // Check if today is contribution day
  const today = new Date();
  const dayOfMonth = today.getDate();
  const lastDayOfMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  const targetDay = Math.min(portfolio.contributionDayOfMonth, lastDayOfMonth);
  const isContributionDay =
    portfolio.contributionEnabled && dayOfMonth === targetDay;

  // Get pending contributions
  const pendingContributions = await prisma.monthlyContribution.aggregate({
    where: {
      portfolioId: portfolio.id,
      deployed: false,
    },
    _sum: { amount: true },
  });

  // Generate alerts
  const alerts = generateAlerts(
    portfolio,
    leverage,
    marginRatio,
    leverageStatus,
    isContributionDay,
    pendingContributions._sum.amount || 0
  );

  // Get user email
  const user = await prisma.user.findUnique({
    where: { id: portfolio.userId },
    select: { email: true },
  });

  return {
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    userEmail: user?.email || "unknown",
    equity,
    exposure,
    leverage,
    marginRatio,
    leverageMin: portfolio.leverageMin,
    leverageMax: portfolio.leverageMax,
    leverageStatus,
    isContributionDay,
    pendingContributions: pendingContributions._sum.amount || 0,
    alerts,
    borrowedAmount,
  };
}

/**
 * Generate alerts based on portfolio state
 */
function generateAlerts(
  portfolio: any,
  leverage: number,
  marginRatio: number,
  leverageStatus: "low" | "in_range" | "high",
  isContributionDay: boolean,
  pendingContributions: number
): Alert[] {
  const alerts: Alert[] = [];

  // Alert: Contribution day
  if (isContributionDay) {
    alerts.push({
      type: "contribution_due",
      priority: "medium",
      message: `Hoy es tu día de aportación mensual. Aportación configurada: $${
        portfolio.monthlyContribution?.toLocaleString() || 0
      }`,
      actionRequired: true,
    });
  }

  // Alert: Leverage too low (need reborrow)
  if (leverageStatus === "low") {
    alerts.push({
      type: "leverage_low",
      priority: "high",
      message: `Leverage efectivo (${leverage.toFixed(
        2
      )}x) por debajo del mínimo (${
        portfolio.leverageMin
      }x). Considera aumentar exposición mediante reborrow.`,
      actionRequired: true,
    });
  }

  // Alert: Leverage too high (need extra contribution)
  if (leverageStatus === "high") {
    const targetEquity = portfolio.exposure / portfolio.leverageMax;
    const extraNeeded = targetEquity - portfolio.equity;

    alerts.push({
      type: "leverage_high",
      priority: "urgent",
      message: `⚠️ URGENTE: Leverage efectivo (${leverage.toFixed(
        2
      )}x) por encima del máximo (${
        portfolio.leverageMax
      }x). Se requiere aporte extra de ~$${Math.ceil(
        extraNeeded
      ).toLocaleString()} para reducir el riesgo.`,
      actionRequired: true,
    });
  }

  // Alert: Margin warning (close to maintenance margin)
  const criticalMargin = portfolio.criticalMarginRatio || 0.1;
  const safeMargin = portfolio.safeMarginRatio || 0.15;

  if (marginRatio <= criticalMargin) {
    alerts.push({
      type: "margin_warning",
      priority: "urgent",
      message: `⚠️ CRÍTICO: Ratio de margen (${(marginRatio * 100).toFixed(
        1
      )}%) cerca del nivel de mantenimiento. Riesgo de margin call inminente.`,
      actionRequired: true,
    });
  } else if (marginRatio <= safeMargin) {
    alerts.push({
      type: "margin_warning",
      priority: "high",
      message: `Ratio de margen (${(marginRatio * 100).toFixed(
        1
      )}%) por debajo del nivel seguro (${(safeMargin * 100).toFixed(
        0
      )}%). Considera reducir exposición o aumentar colateral.`,
      actionRequired: true,
    });
  }

  return alerts;
}

/**
 * Store daily check results in the database
 */
async function storeDailyMetric(state: PortfolioState): Promise<void> {
  // Get today's date in UTC to avoid timezone issues
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  // Calculate peak equity from history
  const allMetrics = await prisma.metricsTimeseries.findMany({
    where: { portfolioId: state.portfolioId },
    select: { equity: true },
  });

  let peakEquity = state.equity;
  for (const m of allMetrics) {
    if (m.equity > peakEquity) {
      peakEquity = m.equity;
    }
  }

  // Upsert daily metric
  await prisma.dailyMetric.upsert({
    where: {
      portfolioId_date: {
        portfolioId: state.portfolioId,
        date: today,
      },
    },
    create: {
      portfolioId: state.portfolioId,
      date: today,
      equity: state.equity,
      exposure: state.exposure,
      leverage: state.leverage,
      peakEquity,
      marginRatio: state.marginRatio,
      borrowedAmount: state.borrowedAmount,
    },
    update: {
      equity: state.equity,
      exposure: state.exposure,
      leverage: state.leverage,
      peakEquity,
      marginRatio: state.marginRatio,
      borrowedAmount: state.borrowedAmount,
    },
  });
}

/**
 * Main daily check function
 */
async function runDailyCheck(): Promise<DailyCheckResult> {
  console.log("🔍 Starting daily portfolio check...");
  console.log(`📅 Date: ${new Date().toISOString().split("T")[0]}\n`);

  const portfolioStates: PortfolioState[] = [];
  let totalAlerts = 0;

  try {
    // Get all portfolios with their configuration
    const portfolios = await prisma.portfolio.findMany({
      include: {
        user: { select: { email: true } },
      },
    });

    if (portfolios.length === 0) {
      console.log("⚠️  No portfolios found. Skipping check.\n");
      return {
        date: new Date().toISOString(),
        portfoliosChecked: 0,
        alertsGenerated: 0,
        portfolioStates: [],
      };
    }

    // Process portfolios silently
    for (const portfolio of portfolios) {
      const state = await calculatePortfolioState(portfolio);

      if (!state) {
        continue;
      }

      // Count alerts
      totalAlerts += state.alerts.length;

      // Store daily metric
      await storeDailyMetric(state);

      portfolioStates.push(state);
    }

    // Summary
    const statusCounts = {
      low: portfolioStates.filter((s) => s.leverageStatus === "low").length,
      in_range: portfolioStates.filter((s) => s.leverageStatus === "in_range").length,
      high: portfolioStates.filter((s) => s.leverageStatus === "high").length,
    };
    const contributionDays = portfolioStates.filter((s) => s.isContributionDay).length;
    const totalEquity = portfolioStates.reduce((sum, s) => sum + s.equity, 0);
    const totalExposure = portfolioStates.reduce((sum, s) => sum + s.exposure, 0);

    console.log(`📋 Summary: ${portfolioStates.length} portfolios | Equity: $${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })} | Exposure: $${totalExposure.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
    console.log(`   Status: ${statusCounts.in_range} in range, ${statusCounts.low} low, ${statusCounts.high} high | Alerts: ${totalAlerts}${contributionDays > 0 ? ` | 📅 ${contributionDays} contribution day(s)` : ""}`);

    // Only log alerts if there are any
    if (totalAlerts > 0) {
      console.log(`\n🔔 Alerts:`);
      for (const state of portfolioStates) {
        for (const alert of state.alerts) {
          const icon = alert.priority === "urgent" ? "🚨" : alert.priority === "high" ? "⚠️" : "📢";
          console.log(`   ${icon} ${state.portfolioName}: ${alert.message}`);
        }
      }
    }

    return {
      date: new Date().toISOString(),
      portfoliosChecked: portfolioStates.length,
      alertsGenerated: totalAlerts,
      portfolioStates,
    };
  } catch (error) {
    console.error("❌ Fatal error during daily check:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// NOTIFICATION PLACEHOLDER
// ============================================

/**
 * Send notifications for urgent alerts
 * TODO: Implement email notifications via SendGrid, Resend, or similar
 */
async function sendNotifications(result: DailyCheckResult): Promise<void> {
  const urgentAlerts = result.portfolioStates.flatMap((state) =>
    state.alerts
      .filter((a) => a.priority === "urgent" || a.priority === "high")
      .map((alert) => ({
        email: state.userEmail,
        portfolioName: state.portfolioName,
        alert,
      }))
  );

  if (urgentAlerts.length === 0) {
    console.log("\n📧 No urgent notifications to send.");
    return;
  }

  console.log(`\n📧 Notifications to send: ${urgentAlerts.length}`);

  for (const notification of urgentAlerts) {
    console.log(
      `   → ${
        notification.email
      }: [${notification.alert.priority.toUpperCase()}] ${
        notification.alert.type
      }`
    );

    // TODO: Implement actual email sending
    // Example with Resend:
    // await resend.emails.send({
    //   from: 'alerts@margn.app',
    //   to: notification.email,
    //   subject: `[${notification.alert.priority.toUpperCase()}] Portfolio Alert: ${notification.portfolioName}`,
    //   html: `<p>${notification.alert.message}</p>`,
    // });
  }

  console.log("   (Email sending not implemented - logging only)");
}

// ============================================
// MAIN
// ============================================

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  runDailyCheck()
    .then(async (result) => {
      await sendNotifications(result);
      console.log("\n✅ Daily check completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Daily check failed:", error);
      process.exit(1);
    });
}

export { runDailyCheck, DailyCheckResult, PortfolioState, Alert };
