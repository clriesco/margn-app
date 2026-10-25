#!/usr/bin/env ts-node

/**
 * Daily price ingestion job (CLI wrapper)
 * The job logic lives in apps/backend/src/cron/jobs so the backend scheduler
 * runs it compiled; this wrapper runs it standalone with its own Prisma client.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

import { ingestPrices as ingestPricesJob } from "../../apps/backend/src/cron/jobs/price-ingestion.job";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

/**
 * Main ingestion function
 */
async function ingestPrices() {
  const prisma = new PrismaClient();
  try {
    await ingestPricesJob(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  ingestPrices()
    .then(() => {
      console.log("✅ Price ingestion completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Price ingestion failed:", error);
      process.exit(1);
    });
}

export { ingestPrices };
