/**
 * Recompute the composite score stored with every saved strategy (user and platform).
 *
 * The score is saved next to the metrics when a strategy is created, so a change to
 * apps/frontend/lib/backtest/scoring.ts does not reach existing rows on its own. It is
 * derived from the stored P10/P50/P90 metrics alone: no backtest, no prices, no API calls.
 * Safe to run any number of times.
 *
 * Logs carry no strategy names or user ids (CI logs are public).
 *
 * Environment variables:
 *   DATABASE_URL — Postgres connection string (falls back to apps/backend/.env)
 *   DRY_RUN      — anything but "false" only reports what would change (default: dry run)
 *
 * Usage: npx ts-node recompute-strategy-scores.ts
 */

import { config } from "dotenv";
import { join } from "path";

if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "../../apps/backend/.env") });
}

import { PrismaClient } from "@prisma/client";
import { computeBacktestScore } from "../../apps/frontend/lib/backtest/scoring";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== "false";

async function main() {
  console.log(`=== Recompute strategy scores (${DRY_RUN ? "DRY RUN" : "APPLY"}) ===\n`);

  const strategies = await prisma.savedStrategy.findMany({
    where: { metricsJson: { not: null } },
    select: { id: true, isPlatform: true, metricsJson: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Strategies with metrics: ${strategies.length}\n`);

  let updated = 0, unchanged = 0, skipped = 0;

  for (const s of strategies) {
    const tag = `${s.id.slice(0, 8)} ${s.isPlatform ? "platform" : "user    "}`;
    try {
      const metrics = JSON.parse(s.metricsJson!);
      const { p10, p50, p90 } = metrics;
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
      if (!p10 || !p50 || !p90) {
        console.log(`${tag}  SKIP: incomplete metrics`);
        skipped++;
        continue;
      }

      const score = computeBacktestScore({
        p10: { cagr: num(p10.cagr), sharpe: num(p10.sharpe), maxDrawdown: num(p10.maxDrawdownEquity) },
        p50: { cagr: num(p50.cagr), sharpe: num(p50.sharpe) },
        p90: { cagr: num(p90.cagr), sharpe: num(p90.sharpe), maxDrawdown: num(p90.maxDrawdownEquity) },
        marginCallCount: num(metrics.marginCallCount),
      });

      const previous = metrics.score?.composite;
      if (JSON.stringify(metrics.score) === JSON.stringify(score)) { unchanged++; continue; }

      const d = score.dimensions;
      console.log(
        `${tag}  ${previous === undefined ? " -" : String(Math.round(previous)).padStart(2)} -> ${String(Math.round(score.composite)).padStart(2)}` +
        `  (consistency ${Math.round(d.dispersion)}, risk/return ${Math.round(d.worstCase)}, sharpe ${Math.round(d.sharpe)}, drawdown ${Math.round(d.drawdown)})`
      );
      metrics.score = score;

      if (!DRY_RUN) {
        await prisma.savedStrategy.update({
          where: { id: s.id },
          data: { metricsJson: JSON.stringify(metrics) },
        });
      }
      updated++;
    } catch (err) {
      console.log(`${tag}  SKIP: ${err instanceof Error ? err.message : err}`);
      skipped++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`${DRY_RUN ? "Would update" : "Updated"}: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Skipped: ${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
