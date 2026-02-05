/**
 * Seed script to populate a demo portfolio with historical data
 *
 * Creates a demo user with email clriesco+demo@gmail.com and simulates
 * monthly DCA investing from January 2024 to November 2025 using real
 * historical prices from Yahoo Finance.
 *
 * Usage: npx ts-node seed-demo-portfolio.ts
 */

import { config } from "dotenv";
import { join } from "path";

// Load environment variables from backend .env (only in development)
if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "apps/backend/.env") });
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Configuration
const DEMO_EMAIL = "clriesco+demo@gmail.com";
const INITIAL_CAPITAL = 10000; // €10,000 initial investment
const MONTHLY_CONTRIBUTION = 1000; // €1,000 monthly
const TARGET_LEVERAGE = 3.0;
const START_DATE = new Date("2024-01-01");
const END_DATE = new Date("2025-11-01");

// Target weights from the optimization (simplified from notebook)
const TARGET_WEIGHTS: Record<string, number> = {
  GLD: 0.4, // Gold 40%
  SPY: 0.25, // S&P 500 25%
  "BTC-USD": 0.35, // Bitcoin 35%
};

// Asset definitions
const ASSETS = [
  { symbol: "GLD", name: "SPDR Gold Shares", assetType: "commodity" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", assetType: "index" },
  { symbol: "BTC-USD", name: "Bitcoin USD", assetType: "crypto" },
];

/**
 * Yahoo Finance API response type
 */
interface YahooFinanceResponse {
  chart?: {
    result?: Array<{
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

/**
 * Fetch historical prices from Yahoo Finance
 */
async function fetchYahooPrice(
  symbol: string,
  date: Date
): Promise<number | null> {
  try {
    // Yahoo Finance API - get price for a specific date range
    const startTs = Math.floor(date.getTime() / 1000);
    const endTs = startTs + 86400 * 7; // Add 7 days to ensure we get data

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${symbol} for ${date.toISOString()}`);
      return null;
    }

    const data = (await response.json()) as YahooFinanceResponse;
    const result = data.chart?.result?.[0];

    if (!result?.indicators?.quote?.[0]?.close) {
      return null;
    }

    // Get the first valid close price
    const closes = result.indicators.quote[0].close;
    for (const close of closes) {
      if (close !== null && close !== undefined) {
        return close;
      }
    }

    return null;
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error);
    return null;
  }
}

/**
 * Get all monthly dates between start and end
 */
function getMonthlyDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }

  return dates;
}

/**
 * Calculate positions based on equity, leverage, weights, and prices
 */
function calculatePositions(
  equity: number,
  leverage: number,
  weights: Record<string, number>,
  prices: Record<string, number>
): Record<string, { quantity: number; value: number }> {
  const totalExposure = equity * leverage;
  const positions: Record<string, { quantity: number; value: number }> = {};

  for (const [symbol, weight] of Object.entries(weights)) {
    const targetValue = totalExposure * weight;
    const price = prices[symbol];

    if (price && price > 0) {
      positions[symbol] = {
        quantity: targetValue / price,
        value: targetValue,
      };
    }
  }

  return positions;
}

/**
 * Main seed function
 */
async function seedDemoPortfolio() {
  console.log("🌱 Starting demo portfolio seed...\n");

  try {
    // 1. Create or get user
    console.log(`📧 Creating user: ${DEMO_EMAIL}`);
    let user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: DEMO_EMAIL,
        },
      });
      console.log(`   ✅ User created: ${user.id}`);
    } else {
      console.log(`   ℹ️  User already exists: ${user.id}`);

      // Clean up existing data for fresh seed
      console.log("   🧹 Cleaning up existing portfolio data...");
      const existingPortfolio = await prisma.portfolio.findFirst({
        where: { userId: user.id },
      });

      if (existingPortfolio) {
        await prisma.metricsTimeseries.deleteMany({
          where: { portfolioId: existingPortfolio.id },
        });
        await prisma.rebalancePosition.deleteMany({
          where: { rebalanceEvent: { portfolioId: existingPortfolio.id } },
        });
        await prisma.rebalanceEvent.deleteMany({
          where: { portfolioId: existingPortfolio.id },
        });
        await prisma.portfolioPosition.deleteMany({
          where: { portfolioId: existingPortfolio.id },
        });
        await prisma.monthlyContribution.deleteMany({
          where: { portfolioId: existingPortfolio.id },
        });
        await prisma.portfolio.delete({
          where: { id: existingPortfolio.id },
        });
      }
    }

    // 2. Create assets
    console.log("\n📦 Creating assets...");
    const assetMap: Record<string, string> = {};

    for (const asset of ASSETS) {
      const existing = await prisma.asset.findUnique({
        where: { symbol: asset.symbol },
      });

      if (existing) {
        assetMap[asset.symbol] = existing.id;
        console.log(`   ℹ️  Asset ${asset.symbol} already exists`);
      } else {
        const created = await prisma.asset.create({
          data: asset,
        });
        assetMap[asset.symbol] = created.id;
        console.log(`   ✅ Asset ${asset.symbol} created`);
      }
    }

    // 3. Create portfolio
    console.log("\n💼 Creating portfolio...");
    const portfolio = await prisma.portfolio.create({
      data: {
        userId: user.id,
        name: "Demo Leveraged DCA Portfolio",
        leverageMin: 2.5,
        leverageMax: 3.0,
      },
    });
    console.log(`   ✅ Portfolio created: ${portfolio.id}`);

    // 4. Get monthly dates
    const monthlyDates = getMonthlyDates(START_DATE, END_DATE);
    console.log(`\n📅 Processing ${monthlyDates.length} months...\n`);

    let currentEquity = INITIAL_CAPITAL;
    let currentPositions: Record<string, { quantity: number; value: number }> =
      {};

    // 5. Process each month
    for (let i = 0; i < monthlyDates.length; i++) {
      const date = monthlyDates[i];
      const isFirstMonth = i === 0;
      const dateStr = date.toISOString().split("T")[0];

      console.log(`\n📆 ${dateStr}`);
      console.log("─".repeat(40));

      // Fetch prices for this date
      console.log("   📈 Fetching prices from Yahoo Finance...");
      const prices: Record<string, number> = {};
      let allPricesFetched = true;

      for (const symbol of Object.keys(TARGET_WEIGHTS)) {
        const price = await fetchYahooPrice(symbol, date);
        if (price) {
          prices[symbol] = price;
          console.log(`      ${symbol}: $${price.toFixed(2)}`);

          // Save price to database
          await prisma.assetPrice.upsert({
            where: {
              assetId_date: {
                assetId: assetMap[symbol],
                date: date,
              },
            },
            create: {
              assetId: assetMap[symbol],
              date: date,
              close: price,
              open: price,
              high: price,
              low: price,
            },
            update: {
              close: price,
            },
          });
        } else {
          allPricesFetched = false;
          console.log(`      ${symbol}: ⚠️ Price not available`);
        }
      }

      if (!allPricesFetched) {
        console.log("   ⏭️  Skipping month due to missing prices");
        continue;
      }

      // Add contribution (except first month which is initial capital)
      const contribution = isFirstMonth
        ? INITIAL_CAPITAL
        : MONTHLY_CONTRIBUTION;

      // Save contribution
      const contributionRecord = await prisma.monthlyContribution.create({
        data: {
          portfolioId: portfolio.id,
          amount: contribution,
          contributedAt: date,
          note: isFirstMonth
            ? `Initial capital - ${dateStr}`
            : `Monthly DCA - ${dateStr}`,
        },
      });

      if (isFirstMonth) {
        console.log(`   💰 Initial capital: $${contribution.toLocaleString()}`);
      } else {
        // Calculate current portfolio value before contribution
        let portfolioValue = 0;
        for (const [symbol, pos] of Object.entries(currentPositions)) {
          portfolioValue += pos.quantity * prices[symbol];
        }

        // Current equity = portfolio value / leverage (simplified)
        currentEquity = portfolioValue / TARGET_LEVERAGE + contribution;
        console.log(`   💰 Contribution: +$${contribution.toLocaleString()}`);
      }

      // Calculate new positions
      const newPositions = calculatePositions(
        currentEquity,
        TARGET_LEVERAGE,
        TARGET_WEIGHTS,
        prices
      );

      // Create rebalance event
      const rebalanceEvent = await prisma.rebalanceEvent.create({
        data: {
          portfolioId: portfolio.id,
          triggeredBy: isFirstMonth ? "initial" : "monthly",
          targetLeverage: TARGET_LEVERAGE,
        },
      });

      // Save positions and rebalance details
      const totalExposure = currentEquity * TARGET_LEVERAGE;
      console.log(
        `   📊 New allocation (Equity: $${currentEquity.toLocaleString()}, Exposure: $${totalExposure.toLocaleString()}):`
      );

      for (const [symbol, pos] of Object.entries(newPositions)) {
        const oldQty = currentPositions[symbol]?.quantity || 0;
        const delta = pos.quantity - oldQty;

        // Save rebalance position
        await prisma.rebalancePosition.create({
          data: {
            rebalanceEventId: rebalanceEvent.id,
            assetId: assetMap[symbol],
            targetWeight: TARGET_WEIGHTS[symbol],
            targetUsd: pos.value,
            deltaQuantity: delta,
          },
        });

        // Upsert portfolio position
        await prisma.portfolioPosition.upsert({
          where: {
            portfolioId_assetId: {
              portfolioId: portfolio.id,
              assetId: assetMap[symbol],
            },
          },
          create: {
            portfolioId: portfolio.id,
            assetId: assetMap[symbol],
            quantity: pos.quantity,
            avgPrice: prices[symbol],
            exposureUsd: pos.value,
          },
          update: {
            quantity: pos.quantity,
            avgPrice: prices[symbol],
            exposureUsd: pos.value,
          },
        });

        const action = delta > 0 ? "BUY" : delta < 0 ? "SELL" : "HOLD";
        const actionEmoji = delta > 0 ? "🟢" : delta < 0 ? "🔴" : "⚪";
        console.log(
          `      ${actionEmoji} ${symbol}: ${pos.quantity.toFixed(
            4
          )} units ($${pos.value.toLocaleString()}) [${action} ${Math.abs(
            delta
          ).toFixed(4)}]`
        );
      }

      // Save metrics snapshot
      await prisma.metricsTimeseries.create({
        data: {
          portfolioId: portfolio.id,
          date: date,
          equity: currentEquity,
          exposure: totalExposure,
          leverage: TARGET_LEVERAGE,
        },
      });

      // Update current positions for next iteration
      currentPositions = newPositions;
    }

    // 6. Summary
    console.log("\n" + "═".repeat(50));
    console.log("✅ SEED COMPLETED SUCCESSFULLY");
    console.log("═".repeat(50));

    const totalContributions = await prisma.monthlyContribution.aggregate({
      where: { portfolioId: portfolio.id },
      _sum: { amount: true },
    });

    const finalMetrics = await prisma.metricsTimeseries.findFirst({
      where: { portfolioId: portfolio.id },
      orderBy: { date: "desc" },
    });

    const rebalanceCount = await prisma.rebalanceEvent.count({
      where: { portfolioId: portfolio.id },
    });

    console.log(`\n📊 Summary:`);
    console.log(`   User: ${DEMO_EMAIL}`);
    console.log(`   Portfolio: ${portfolio.name}`);
    console.log(
      `   Total contributions: $${totalContributions._sum.amount?.toLocaleString()}`
    );
    console.log(`   Final equity: $${finalMetrics?.equity.toLocaleString()}`);
    console.log(
      `   Final exposure: $${finalMetrics?.exposure.toLocaleString()}`
    );
    console.log(`   Rebalance events: ${rebalanceCount}`);
    console.log(
      `   Period: ${START_DATE.toISOString().split("T")[0]} to ${
        END_DATE.toISOString().split("T")[0]
      }`
    );
  } catch (error) {
    console.error("\n❌ Error during seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed
seedDemoPortfolio()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
