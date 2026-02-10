#!/usr/bin/env ts-node

/**
 * Daily jobs runner
 * Executes all daily cron jobs in the correct order:
 * 0. Cleanup Duplicates - Removes duplicate metrics entries
 * 1. Price Ingestion - Fetches daily asset prices
 * 2. Metrics Refresh - Recalculates portfolio metrics
 * 3. Daily Check - Verifies portfolios and generates status notifications
 *
 * Usage:
 *   npm run daily:all
 *   or
 *   npx ts-node run-daily-jobs.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

import { ingestPrices } from "./price-ingestion";
import { refreshMetrics } from "./metrics-refresh";
import { runDailyCheck } from "./daily-check";

interface JobResult {
  name: string;
  success: boolean;
  duration: number;
  error?: string;
}

/**
 * Run all daily jobs in sequence
 */
async function runAllDailyJobs() {
  console.log("🚀 Starting daily jobs pipeline...\n");
  const startTime = Date.now();
  const results: JobResult[] = [];

  const jobs = [
    {
      name: "Price Ingestion",
      fn: ingestPrices,
    },
    {
      name: "Metrics Refresh",
      fn: refreshMetrics,
    },
    {
      name: "Daily Check",
      fn: runDailyCheck,
    },
  ];

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const jobStartTime = Date.now();

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📋 Job ${i + 1}/${jobs.length}: ${job.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    try {
      await job.fn();
      const duration = ((Date.now() - jobStartTime) / 1000).toFixed(2);
      console.log(`\n✅ ${job.name} completed successfully (${duration}s)\n`);
      results.push({
        name: job.name,
        success: true,
        duration: Date.now() - jobStartTime,
      });
    } catch (error) {
      const duration = ((Date.now() - jobStartTime) / 1000).toFixed(2);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`\n❌ ${job.name} failed after ${duration}s`);
      console.error(`   Error: ${errorMessage}\n`);
      results.push({
        name: job.name,
        success: false,
        duration: Date.now() - jobStartTime,
        error: errorMessage,
      });

      // Decide whether to continue or stop
      // For price ingestion failure, we might want to stop
      // For other failures, we might continue
      if (i === 0) {
        // Price ingestion failed - stop pipeline
        console.error(
          "⚠️  Price ingestion failed. Stopping pipeline as subsequent jobs depend on it."
        );
        break;
      } else {
        // Other jobs failed - continue but log warning
        console.warn(
          `⚠️  ${job.name} failed, but continuing with remaining jobs...\n`
        );
      }
    }
  }

  // Summary
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📊 Daily Jobs Pipeline Summary`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  results.forEach((result) => {
    const duration = (result.duration / 1000).toFixed(2);
    const status = result.success ? "✅" : "❌";
    console.log(
      `${status} ${result.name}: ${duration}s${
        result.error ? ` (${result.error})` : ""
      }`
    );
  });

  console.log(`\n   Total duration: ${totalDuration}s`);
  console.log(`   Successful: ${successful}/${results.length}`);
  console.log(`   Failed: ${failed}/${results.length}\n`);

  if (failed > 0) {
    console.error("⚠️  Some jobs failed. Please review the logs above.");
    process.exit(1);
  } else {
    console.log("✅ All daily jobs completed successfully!");
    process.exit(0);
  }
}

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  runAllDailyJobs().catch((error) => {
    console.error("❌ Fatal error in daily jobs pipeline:", error);
    process.exit(1);
  });
}

export { runAllDailyJobs };
