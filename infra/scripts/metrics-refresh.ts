#!/usr/bin/env ts-node

/**
 * Daily metrics refresh job (CLI wrapper)
 * The job logic lives in apps/backend/src/cron/jobs so the backend scheduler
 * runs it compiled; this wrapper runs it standalone with its own Prisma client.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

import { refreshMetrics as refreshMetricsJob } from "../../apps/backend/src/cron/jobs/metrics-refresh.job";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

/**
 * Main metrics refresh function
 */
async function refreshMetrics() {
  const prisma = new PrismaClient();
  try {
    await refreshMetricsJob(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  refreshMetrics()
    .then(() => {
      console.log("✅ Metrics refresh completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Metrics refresh failed:", error);
      process.exit(1);
    });
}

export { refreshMetrics };
