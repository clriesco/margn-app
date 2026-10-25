/**
 * Daily portfolio check job
 * Verifies leverage status, generates notifications, and checks contribution days
 *
 * The Prisma client is injected: the backend scheduler passes its shared
 * PrismaService, while the infra/scripts CLI wrapper passes its own client.
 */

import { PrismaClient } from "@prisma/client";

// ============================================
// TYPES
// ============================================

export interface PortfolioState {
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
  monthlyContribution: number | null;
  pendingContributions: number;
  notifications: StatusNotification[];
  borrowedAmount: number | null;
}

export interface StatusNotification {
  type:
    | "contribution_reminder"
    | "leverage_below_range"
    | "leverage_above_range"
    | "margin_ratio_alert";
  level: "info" | "warning" | "attention";
  message: string;
  actionRequired: boolean;
}

export interface DailyCheckResult {
  date: string;
  portfoliosChecked: number;
  notificationsGenerated: number;
  portfolioStates: PortfolioState[];
}

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Get latest prices for assets
 */
async function getLatestPrices(
  prisma: PrismaClient,
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
  prisma: PrismaClient,
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
  const latestPrices = await getLatestPrices(
    prisma,
    positions.map((p) => p.assetId)
  );

  // Calculate exposure
  let exposure = 0;
  for (const pos of positions) {
    const price = latestPrices[pos.assetId] || pos.avgPrice;
    exposure += pos.quantity * price;
  }

  // Get equity from latest metrics or calculate estimate
  let equity = portfolio.initialCapital;
  let borrowedAmount: number | null = null;

  const latestMetric = await prisma.metricsTimeseries.findFirst({
    where: { portfolioId: portfolio.id },
    orderBy: { date: "desc" },
    select: {
      equity: true,
      exposure: true,
      borrowedAmount: true,
      updatedAt: true,
    },
  });

  if (latestMetric) {
    borrowedAmount = latestMetric.borrowedAmount;

    // Get contributions made AFTER the metric was last updated
    const contributions = await prisma.monthlyContribution.findMany({
      where: {
        portfolioId: portfolio.id,
        contributedAt: {
          gt: latestMetric.updatedAt,
        },
      },
    });

    const contributionsSinceLastMetric = contributions.reduce(
      (sum: number, c: any) => sum + (c.type === "withdrawal" ? -c.amount : c.amount),
      0
    );

    const oldEquityFromPrices = latestMetric.exposure - (borrowedAmount || 0);
    const newEquityFromPrices = exposure - (borrowedAmount || 0);
    const equityChangeFromPrices = newEquityFromPrices - oldEquityFromPrices;

    equity =
      latestMetric.equity +
      equityChangeFromPrices +
      contributionsSinceLastMetric;
  } else {
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

  // Check if today is contribution day (frequency-aware)
  const today = new Date();
  const frequency = portfolio.contributionFrequency || "monthly";
  const dayValue = portfolio.contributionDayOfMonth;
  let isContributionDay = false;

  if (portfolio.contributionEnabled) {
    switch (frequency) {
      case "weekly": {
        isContributionDay = today.getDay() === dayValue;
        break;
      }
      case "biweekly": {
        if (today.getDay() === dayValue) {
          const referenceDate = new Date(2024, 0, 1);
          const daysDiff = Math.floor(
            (today.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
          );
          isContributionDay = Math.floor(daysDiff / 7) % 2 === 0;
        }
        break;
      }
      case "monthly": {
        const lastDayOfMonth = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0
        ).getDate();
        isContributionDay =
          today.getDate() === Math.min(dayValue, lastDayOfMonth);
        break;
      }
      case "quarterly": {
        const quarterMonths = [0, 3, 6, 9]; // Jan, Apr, Jul, Oct
        if (quarterMonths.includes(today.getMonth())) {
          const lastDayOfMonth = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0
          ).getDate();
          isContributionDay =
            today.getDate() === Math.min(dayValue, lastDayOfMonth);
        }
        break;
      }
    }
  }

  // Get pending contributions
  const pendingContributions = await prisma.monthlyContribution.aggregate({
    where: {
      portfolioId: portfolio.id,
      deployed: false,
    },
    _sum: { amount: true },
  });

  // Generate notifications
  const notifications = generateNotifications(
    portfolio,
    leverage,
    marginRatio,
    leverageStatus,
    isContributionDay,
    pendingContributions._sum.amount || 0,
    exposure,
    equity
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
    monthlyContribution: portfolio.monthlyContribution,
    pendingContributions: pendingContributions._sum.amount || 0,
    notifications,
    borrowedAmount,
  };
}

/**
 * Generate status notifications based on portfolio state
 */
function generateNotifications(
  portfolio: any,
  leverage: number,
  marginRatio: number,
  leverageStatus: "low" | "in_range" | "high",
  isContributionDay: boolean,
  pendingContributions: number,
  exposure: number,
  equity: number
): StatusNotification[] {
  const notifications: StatusNotification[] = [];

  // Notification: Contribution day
  if (isContributionDay) {
    notifications.push({
      type: "contribution_reminder",
      level: "info",
      message: `Hoy es tu día de aportación configurado. Monto definido: $${
        portfolio.monthlyContribution?.toLocaleString() || 0
      }`,
      actionRequired: true,
    });
  }

  // Notification: Leverage below configured range
  if (leverageStatus === "low") {
    notifications.push({
      type: "leverage_below_range",
      level: "warning",
      message: `Leverage efectivo (${leverage.toFixed(
        2
      )}x) por debajo del mínimo configurado (${
        portfolio.leverageMin
      }x). Puedes evaluar si aumentar la exposición.`,
      actionRequired: true,
    });
  }

  // Notification: Leverage above configured range
  if (leverageStatus === "high") {
    const targetEquity = exposure / portfolio.leverageMax;
    const extraNeeded = targetEquity - equity;

    notifications.push({
      type: "leverage_above_range",
      level: "attention",
      message: `Leverage efectivo (${leverage.toFixed(
        2
      )}x) por encima del máximo configurado (${
        portfolio.leverageMax
      }x). El cálculo indica que un aporte de ~$${Math.ceil(
        extraNeeded
      ).toLocaleString()} reduciría el leverage al rango configurado.`,
      actionRequired: true,
    });
  }

  // Notification: Margin ratio alert
  const criticalMargin = portfolio.criticalMarginRatio || 0.1;
  const safeMargin = portfolio.safeMarginRatio || 0.15;

  if (marginRatio <= criticalMargin) {
    notifications.push({
      type: "margin_ratio_alert",
      level: "attention",
      message: `Ratio de margen (${(marginRatio * 100).toFixed(
        1
      )}%) cerca del nivel de mantenimiento. Riesgo elevado de liquidación.`,
      actionRequired: true,
    });
  } else if (marginRatio <= safeMargin) {
    notifications.push({
      type: "margin_ratio_alert",
      level: "warning",
      message: `Ratio de margen (${(marginRatio * 100).toFixed(
        1
      )}%) por debajo del nivel seguro (${(safeMargin * 100).toFixed(
        0
      )}%). Puedes evaluar reducir la exposición o aumentar el colateral.`,
      actionRequired: true,
    });
  }

  return notifications;
}

/**
 * Store daily check results in the database
 */
async function storeDailyMetric(
  prisma: PrismaClient,
  state: PortfolioState
): Promise<void> {
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
export async function runDailyCheck(
  prisma: PrismaClient
): Promise<DailyCheckResult> {
  console.log("🔍 Starting daily portfolio check...");
  console.log(`📅 Date: ${new Date().toISOString().split("T")[0]}\n`);

  const portfolioStates: PortfolioState[] = [];
  let totalNotifications = 0;

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
        notificationsGenerated: 0,
        portfolioStates: [],
      };
    }

    // Process portfolios silently
    for (const portfolio of portfolios) {
      const state = await calculatePortfolioState(prisma, portfolio);

      if (!state) {
        continue;
      }

      // Count notifications
      totalNotifications += state.notifications.length;

      // Store daily metric
      await storeDailyMetric(prisma, state);

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
    console.log(`   Status: ${statusCounts.in_range} in range, ${statusCounts.low} low, ${statusCounts.high} high | Notifications: ${totalNotifications}${contributionDays > 0 ? ` | 📅 ${contributionDays} contribution day(s)` : ""}`);

    // Only log notifications if there are any
    if (totalNotifications > 0) {
      console.log(`\n🔔 Notifications:`);
      for (const state of portfolioStates) {
        for (const notification of state.notifications) {
          const icon = notification.level === "attention" ? "🚨" : notification.level === "warning" ? "⚠️" : "📢";
          console.log(`   ${icon} ${state.portfolioName}: ${notification.message}`);
        }
      }
    }

    return {
      date: new Date().toISOString(),
      portfoliosChecked: portfolioStates.length,
      notificationsGenerated: totalNotifications,
      portfolioStates,
    };
  } catch (error) {
    console.error("❌ Fatal error during daily check:", error);
    throw error;
  }
}
