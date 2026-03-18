#!/usr/bin/env ts-node

/**
 * Backfill missing MetricsTimeseries and DailyMetric entries.
 *
 * Applied: 2026-03-18 to fill gap from March 14-16, 2026 caused by
 * daily-metrics cron job failing for 4 consecutive days in production.
 *
 * What it does:
 * - For each missing date (chronologically), calculates exposure from
 *   existing AssetPrice data and derives equity incrementally from the
 *   previous day's metric (equity = prev_equity + exposure_change).
 * - Preserves borrowedAmount (no rebalances/contributions during gap).
 * - Upserts both MetricsTimeseries and DailyMetric (with peakEquity).
 * - Portfolios with no positions are carried forward unchanged.
 *
 * Prerequisites:
 * - AssetPrice data must exist for all gap dates (price-ingestion was OK).
 * - No contributions or rebalances occurred during the gap.
 *
 * Usage:
 *   DATABASE_URL="..." npx ts-node infra/scripts/backfill-metrics-gap.ts
 *
 * To adapt for a different gap, edit GAP_DATES below.
 */

import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import * as path from "path";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

const prisma = new PrismaClient();

const GAP_DATES = ["2026-03-14", "2026-03-15", "2026-03-16"];

function toUTCDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function uuid(): string {
  return crypto.randomUUID();
}

async function backfillDate(portfolioId: string, portfolioName: string, targetDate: Date) {
  // Get positions for this portfolio
  const positions = await prisma.portfolioPosition.findMany({
    where: { portfolioId },
    include: { asset: true },
  });

  if (positions.length === 0) {
    // Portfolio with no positions — check if it had a metric the day before
    const prevMetric = await prisma.metricsTimeseries.findFirst({
      where: { portfolioId, date: { lt: targetDate } },
      orderBy: { date: "desc" },
    });

    if (!prevMetric) return;

    // Carry forward the previous metric (no positions = no price change)
    const marginRatio = prevMetric.equity > 0 && prevMetric.exposure > 0
      ? prevMetric.equity / prevMetric.exposure
      : 1;

    await prisma.metricsTimeseries.upsert({
      where: { portfolioId_date: { portfolioId, date: targetDate } },
      create: {
        id: uuid(),
        portfolioId,
        date: targetDate,
        equity: prevMetric.equity,
        exposure: prevMetric.exposure,
        leverage: prevMetric.leverage,
        borrowedAmount: prevMetric.borrowedAmount,
        sharpe: null,
        drawdown: null,
        metadataJson: JSON.stringify({ source: "backfill" }),
      },
      update: {
        equity: prevMetric.equity,
        exposure: prevMetric.exposure,
        leverage: prevMetric.leverage,
        borrowedAmount: prevMetric.borrowedAmount,
        metadataJson: JSON.stringify({ source: "backfill" }),
      },
    });

    // Peak equity from all prior metrics
    const allMetrics = await prisma.metricsTimeseries.findMany({
      where: { portfolioId, date: { lte: targetDate } },
      select: { equity: true },
    });
    const peakEquity = Math.max(...allMetrics.map((m) => m.equity));

    await prisma.dailyMetric.upsert({
      where: { portfolioId_date: { portfolioId, date: targetDate } },
      create: {
        id: uuid(),
        portfolioId,
        date: targetDate,
        equity: prevMetric.equity,
        exposure: prevMetric.exposure,
        leverage: prevMetric.leverage,
        borrowedAmount: prevMetric.borrowedAmount,
        marginRatio,
        peakEquity,
      },
      update: {
        equity: prevMetric.equity,
        exposure: prevMetric.exposure,
        leverage: prevMetric.leverage,
        borrowedAmount: prevMetric.borrowedAmount,
        marginRatio,
        peakEquity,
      },
    });

    console.log(
      `  ${targetDate.toISOString().slice(0, 10)} [no positions]: equity=$${prevMetric.equity.toFixed(2)}, carried forward`
    );
    return;
  }

  // Get prices for each asset on this date (or closest prior date)
  const assetPrices = await Promise.all(
    positions.map(async (pos) => {
      const price = await prisma.assetPrice.findFirst({
        where: { assetId: pos.assetId, date: { lte: targetDate } },
        orderBy: { date: "desc" },
      });
      return { assetId: pos.assetId, price: price?.close || pos.avgPrice };
    })
  );
  const priceMap = new Map(assetPrices.map((p) => [p.assetId, p.price]));

  // Calculate exposure
  let totalExposure = 0;
  const composition = positions.map((pos) => {
    const currentPrice = priceMap.get(pos.assetId) || pos.avgPrice;
    const value = pos.quantity * currentPrice;
    totalExposure += value;
    return { symbol: pos.asset.symbol, weight: 0, value, quantity: pos.quantity };
  });
  composition.forEach((c) => {
    c.weight = totalExposure > 0 ? c.value / totalExposure : 0;
  });

  // Get previous day's metric (strictly before target date)
  const prevMetric = await prisma.metricsTimeseries.findFirst({
    where: { portfolioId, date: { lt: targetDate } },
    orderBy: { date: "desc" },
  });

  if (!prevMetric) {
    console.log(
      `  ${targetDate.toISOString().slice(0, 10)}: SKIPPED (no prior metric found)`
    );
    return;
  }

  // Incremental equity calculation (same as metrics-refresh)
  const borrowedAmount = prevMetric.borrowedAmount ?? (prevMetric.exposure - prevMetric.equity);
  const exposureChange = totalExposure - prevMetric.exposure;
  const equity = prevMetric.equity + exposureChange;
  const leverage = equity > 0 ? totalExposure / equity : 0;
  const marginRatio = equity > 0 && totalExposure > 0 ? equity / totalExposure : 1;

  const metadata = {
    source: "backfill",
    composition,
  };

  // Upsert MetricsTimeseries
  await prisma.metricsTimeseries.upsert({
    where: { portfolioId_date: { portfolioId, date: targetDate } },
    create: {
      id: uuid(),
      portfolioId,
      date: targetDate,
      equity,
      exposure: totalExposure,
      leverage,
      borrowedAmount,
      sharpe: null,
      drawdown: null,
      metadataJson: JSON.stringify(metadata),
    },
    update: {
      equity,
      exposure: totalExposure,
      leverage,
      borrowedAmount,
      metadataJson: JSON.stringify(metadata),
    },
  });

  // Calculate peak equity from all metrics up to this date
  const allMetrics = await prisma.metricsTimeseries.findMany({
    where: { portfolioId, date: { lte: targetDate } },
    select: { equity: true },
  });
  const peakEquity = Math.max(...allMetrics.map((m) => m.equity));

  // Upsert DailyMetric
  await prisma.dailyMetric.upsert({
    where: { portfolioId_date: { portfolioId, date: targetDate } },
    create: {
      id: uuid(),
      portfolioId,
      date: targetDate,
      equity,
      exposure: totalExposure,
      leverage,
      borrowedAmount,
      marginRatio,
      peakEquity,
    },
    update: {
      equity,
      exposure: totalExposure,
      leverage,
      borrowedAmount,
      marginRatio,
      peakEquity,
    },
  });

  console.log(
    `  ${targetDate.toISOString().slice(0, 10)}: equity=$${equity.toFixed(2)}, exposure=$${totalExposure.toFixed(2)}, leverage=${leverage.toFixed(2)}x, borrowed=$${borrowedAmount.toFixed(2)}`
  );
}

async function main() {
  console.log("=== Backfilling metrics gap (March 14-16, 2026) ===\n");

  const portfolios = await prisma.portfolio.findMany({
    select: { id: true, name: true },
  });

  console.log(`Found ${portfolios.length} portfolios\n`);

  // Process dates in chronological order (critical for incremental equity)
  for (const dateStr of GAP_DATES) {
    const targetDate = toUTCDate(dateStr);
    console.log(`\n--- ${dateStr} ---`);

    for (const portfolio of portfolios) {
      console.log(`Portfolio: ${portfolio.name}`);
      await backfillDate(portfolio.id, portfolio.name, targetDate);
    }
  }

  // Verification: show data around the gap
  console.log("\n\n=== Verification ===");
  for (const portfolio of portfolios) {
    const metrics = await prisma.metricsTimeseries.findMany({
      where: {
        portfolioId: portfolio.id,
        date: { gte: toUTCDate("2026-03-12"), lte: toUTCDate("2026-03-17") },
      },
      orderBy: { date: "asc" },
      select: { date: true, equity: true, exposure: true, leverage: true, borrowedAmount: true },
    });

    if (metrics.length === 0) continue;
    if (metrics.every((m) => m.exposure === 0)) continue;

    console.log(`\n${portfolio.name}:`);
    console.log("  date       | equity      | exposure    | leverage | borrowed");
    console.log("  -----------|-------------|-------------|----------|--------");
    for (const m of metrics) {
      const d = m.date instanceof Date ? m.date.toISOString().slice(0, 10) : String(m.date);
      console.log(
        `  ${d} | $${m.equity.toFixed(2).padStart(9)} | $${m.exposure.toFixed(2).padStart(9)} | ${m.leverage.toFixed(2).padStart(6)}x | $${(m.borrowedAmount ?? 0).toFixed(2)}`
      );
    }

    // Check continuity: borrowedAmount should be constant across the gap
    const borrowedValues = metrics.filter((m) => m.exposure > 0).map((m) => m.borrowedAmount ?? 0);
    const allSame = borrowedValues.every((v) => Math.abs(v - borrowedValues[0]) < 0.01);
    if (!allSame) {
      console.log(`  ⚠️  WARNING: borrowedAmount changed during gap!`);
    }
  }

  console.log("\n✅ Backfill complete");
}

main()
  .catch((error) => {
    console.error("❌ Backfill failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
