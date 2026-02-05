#!/usr/bin/env ts-node

/**
 * Script to completely reset the database
 * 
 * WARNING: This will delete ALL data:
 * - All users
 * - All portfolios
 * - All metrics
 * - All contributions
 * - All positions
 * - All assets and prices
 * - All rebalance events
 * 
 * Use with caution! This is irreversible.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";
import * as readline from "readline";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

/**
 * Prompt user for confirmation
 */
function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes" || answer.toLowerCase() === "y");
    });
  });
}

async function resetDatabase() {
  console.log("⚠️  WARNING: This will DELETE ALL DATA from the database!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  const confirmed = await askConfirmation(
    "Are you sure you want to continue? Type 'yes' to confirm: "
  );

  if (!confirmed) {
    console.log("❌ Operation cancelled.");
    return;
  }

  console.log("\n🗑️  Starting database reset...\n");

  try {
    // Get counts before deletion for summary
    const counts = {
      users: await prisma.user.count(),
      portfolios: await prisma.portfolio.count(),
      assets: await prisma.asset.count(),
      positions: await prisma.portfolioPosition.count(),
      contributions: await prisma.monthlyContribution.count(),
      rebalanceEvents: await prisma.rebalanceEvent.count(),
      rebalancePositions: await prisma.rebalancePosition.count(),
      assetPrices: await prisma.assetPrice.count(),
      metricsTimeseries: await prisma.metricsTimeseries.count(),
      dailyMetrics: 0,
    };

    // Count daily metrics (might not exist in schema)
    try {
      const dailyMetricClient = prisma.dailyMetric;
      if (dailyMetricClient) {
        counts.dailyMetrics = await dailyMetricClient.count();
      }
    } catch (e) {
      // DailyMetric table might not exist, ignore
    }

    console.log("📊 Current database state:");
    console.log(`   Users: ${counts.users}`);
    console.log(`   Portfolios: ${counts.portfolios}`);
    console.log(`   Assets: ${counts.assets}`);
    console.log(`   Positions: ${counts.positions}`);
    console.log(`   Contributions: ${counts.contributions}`);
    console.log(`   Rebalance Events: ${counts.rebalanceEvents}`);
    console.log(`   Rebalance Positions: ${counts.rebalancePositions}`);
    console.log(`   Asset Prices: ${counts.assetPrices}`);
    console.log(`   Metrics Timeseries: ${counts.metricsTimeseries}`);
    console.log(`   Daily Metrics: ${counts.dailyMetrics}\n`);

    // Delete in order to respect foreign key constraints
    // Start with dependent tables first

    console.log("🗑️  Deleting Rebalance Positions...");
    const deletedRebalancePositions = await prisma.rebalancePosition.deleteMany({});
    console.log(`   ✅ Deleted ${deletedRebalancePositions.count} rebalance position(s)`);

    console.log("🗑️  Deleting Rebalance Events...");
    const deletedRebalanceEvents = await prisma.rebalanceEvent.deleteMany({});
    console.log(`   ✅ Deleted ${deletedRebalanceEvents.count} rebalance event(s)`);

    console.log("🗑️  Deleting Portfolio Positions...");
    const deletedPositions = await prisma.portfolioPosition.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPositions.count} position(s)`);

    console.log("ℹ️  Keeping Asset Prices (historical data preserved)");

    console.log("🗑️  Deleting Daily Metrics...");
    try {
      const dailyMetricClient = prisma.dailyMetric;
      if (dailyMetricClient) {
        const deletedDailyMetrics = await dailyMetricClient.deleteMany({});
        console.log(`   ✅ Deleted ${deletedDailyMetrics.count} daily metric(s)`);
      } else {
        console.log("   ⚠️  DailyMetric table not found, skipping");
      }
    } catch (e) {
      console.log("   ⚠️  Error deleting daily metrics (table might not exist):", e);
    }

    console.log("🗑️  Deleting Metrics Timeseries...");
    const deletedMetrics = await prisma.metricsTimeseries.deleteMany({});
    console.log(`   ✅ Deleted ${deletedMetrics.count} metric(s)`);

    console.log("🗑️  Deleting Monthly Contributions...");
    const deletedContributions = await prisma.monthlyContribution.deleteMany({});
    console.log(`   ✅ Deleted ${deletedContributions.count} contribution(s)`);

    console.log("🗑️  Deleting Portfolios...");
    const deletedPortfolios = await prisma.portfolio.deleteMany({});
    console.log(`   ✅ Deleted ${deletedPortfolios.count} portfolio(s)`);

    console.log("ℹ️  Keeping Assets (preserved with historical prices)");

    console.log("🗑️  Deleting Users...");
    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`   ✅ Deleted ${deletedUsers.count} user(s)`);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ Database reset completed successfully!");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Verify everything is deleted
    const remainingCounts = {
      users: await prisma.user.count(),
      portfolios: await prisma.portfolio.count(),
      positions: await prisma.portfolioPosition.count(),
      contributions: await prisma.monthlyContribution.count(),
      rebalanceEvents: await prisma.rebalanceEvent.count(),
      rebalancePositions: await prisma.rebalancePosition.count(),
      metricsTimeseries: await prisma.metricsTimeseries.count(),
    };
    const preservedCounts = {
      assets: await prisma.asset.count(),
      assetPrices: await prisma.assetPrice.count(),
    };

    const allZero = Object.values(remainingCounts).every((count) => count === 0);

    if (allZero) {
      console.log("✅ Verification: All portfolio data cleared.");
      console.log(`ℹ️  Preserved: ${preservedCounts.assets} asset(s), ${preservedCounts.assetPrices} price record(s)`);
    } else {
      console.log("⚠️  Warning: Some tables still have data:");
      Object.entries(remainingCounts).forEach(([table, count]) => {
        if (count > 0) {
          console.log(`   - ${table}: ${count} record(s)`);
        }
      });
    }
  } catch (error) {
    console.error("❌ Error resetting database:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the reset
resetDatabase()
  .then(() => {
    console.log("\n✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });


