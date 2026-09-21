/**
 * Recompute CAGR, Sharpe, max drawdown, recovery days and score of user-saved strategies
 * on time-weighted returns.
 *
 * Strategies saved before the metrics fix (c0bf525) stored those figures computed on raw
 * account equity, which counts every monthly contribution as a return. The saved daily
 * equity is enough to redo them exactly: the engine adds the full monthly contribution to
 * equity every REBALANCE_INTERVAL_DAYS, so the deposits can be placed from the config.
 *
 * What it does NOT fix: which windows were picked as P10/P50/P90 (ranked by the old Sharpe;
 * the other windows were never stored) and the saved AI analysis text.
 *
 * Platform strategies are skipped: re-run seed-platform-strategies.ts for those.
 * The previous values are kept under metrics.preTwrFix, which also makes a second run a no-op.
 * Logs carry no strategy names or user ids (CI logs are public).
 *
 * Environment variables:
 *   DATABASE_URL — Postgres connection string (falls back to apps/backend/.env)
 *   DRY_RUN      — anything but "false" only reports what would change (default: dry run)
 *
 * Usage: npx ts-node backfill-strategy-metrics.ts
 */

import { config } from "dotenv";
import { join } from "path";

if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "../../apps/backend/.env") });
}

import { PrismaClient } from "@prisma/client";
import {
  calculateWindowMetrics,
  REBALANCE_INTERVAL_DAYS,
} from "../../apps/frontend/lib/backtest/engine/metrics";
import { computeBacktestScore } from "../../apps/frontend/lib/backtest/scoring";
import type { PortfolioState } from "../../apps/frontend/lib/backtest/types";

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== "false";
const DEFAULT_RISK_FREE_RATE = 0.02;
const SCENARIOS = ["p10", "p50", "p90"] as const;

interface SavedScenario {
  cagr: number;
  sharpe: number;
  maxDrawdownEquity: number;
  recoveryDays: number;
  totalContributed: number;
  [key: string]: unknown;
}

interface Recomputed {
  cagr: number;
  sharpe: number;
  maxDrawdownEquity: number;
  recoveryDays: number;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * Redo one scenario from its daily equity. Returns a reason string when it must be left alone.
 */
export function recomputeScenario(
  saved: SavedScenario,
  points: { date: string; equity: number }[],
  monthlyContribution: number,
  riskFreeRate: number
): Recomputed | string {
  if (!points || points.length < 2) return "no trajectory";
  // Margin-called windows carry fixed catastrophic metrics, never computed from equity
  if (points[points.length - 1].equity <= 0) return "margin call";

  const contributions: number[] = [];
  const contributionIndices: number[] = [];
  for (let at = REBALANCE_INTERVAL_DAYS; at < points.length; at += REBALANCE_INTERVAL_DAYS) {
    contributions.push(monthlyContribution);
    contributionIndices.push(at);
  }
  const totalContributed = contributions.length * monthlyContribution;

  // The schedule is an assumption about how the row was produced: check it against the
  // contributed total the engine stored, and leave the row alone if they disagree.
  if (Math.abs(totalContributed - saved.totalContributed) > 0.01) {
    return `contribution schedule mismatch (${totalContributed} vs saved ${saved.totalContributed})`;
  }

  const states: PortfolioState[] = points.map((p, day) => ({
    day, date: p.date, equity: p.equity,
    exposure: 0, leverage: 0, borrowedAmount: 0, positions: {},
    peakEquity: p.equity, marginRatio: 1, marginCall: false,
  }));
  const m = calculateWindowMetrics(
    states, totalContributed, riskFreeRate, 0,
    points[0].date, points[points.length - 1].date, contributions, contributionIndices
  );
  const safe = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    cagr: safe(m.cagr),
    sharpe: safe(m.sharpe),
    maxDrawdownEquity: m.maxDrawdownEquity,
    recoveryDays: m.recoveryDays,
  };
}

async function main() {
  console.log(`=== Backfill strategy metrics (${DRY_RUN ? "DRY RUN" : "APPLY"}) ===\n`);

  const strategies = await prisma.savedStrategy.findMany({
    where: { isPlatform: false, metricsJson: { not: null }, trajectoriesJson: { not: null } },
    select: { id: true, configJson: true, metricsJson: true, trajectoriesJson: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`User strategies with metrics and trajectories: ${strategies.length}\n`);

  let updated = 0, alreadyDone = 0, alreadyCorrect = 0, skipped = 0;

  for (const s of strategies) {
    const tag = s.id.slice(0, 8);
    try {
      const cfg = JSON.parse(s.configJson);
      const metrics = JSON.parse(s.metricsJson!);
      const trajectories = JSON.parse(s.trajectoriesJson!);

      if (metrics.preTwrFix) { alreadyDone++; continue; }
      if (typeof cfg.monthlyContribution !== "number") {
        console.log(`${tag}  SKIP: config has no monthlyContribution`);
        skipped++;
        continue;
      }
      const riskFreeRate = typeof cfg.riskFreeRate === "number" ? cfg.riskFreeRate : DEFAULT_RISK_FREE_RATE;

      const next: Partial<Record<(typeof SCENARIOS)[number], Recomputed>> = {};
      let reason: string | null = null;
      for (const key of SCENARIOS) {
        const r = recomputeScenario(metrics[key], trajectories[key]?.points, cfg.monthlyContribution, riskFreeRate);
        if (typeof r === "string") {
          // A margin-called scenario keeps its saved values; anything else blocks the row
          if (r !== "margin call") { reason = `${key}: ${r}`; break; }
        } else {
          next[key] = r;
        }
      }
      if (reason) {
        console.log(`${tag}  SKIP: ${reason}`);
        skipped++;
        continue;
      }

      // Saved after the fix: the stored CAGR already is the time-weighted one
      const changed = SCENARIOS.some((k) => next[k] && Math.abs(next[k]!.cagr - metrics[k].cagr) > 1e-6);
      if (!changed) { alreadyCorrect++; continue; }

      const preTwrFix: Record<string, unknown> = {};
      for (const key of SCENARIOS) {
        if (!next[key]) continue;
        const old = metrics[key];
        preTwrFix[key] = {
          cagr: old.cagr, sharpe: old.sharpe,
          maxDrawdownEquity: old.maxDrawdownEquity, recoveryDays: old.recoveryDays,
        };
        console.log(
          `${tag}  ${key}  CAGR ${pct(old.cagr)} -> ${pct(next[key]!.cagr)}  ` +
          `Sharpe ${Number(old.sharpe).toFixed(2)} -> ${next[key]!.sharpe.toFixed(2)}  ` +
          `maxDD ${pct(old.maxDrawdownEquity)} -> ${pct(next[key]!.maxDrawdownEquity)}`
        );
        Object.assign(old, next[key]);
      }
      if (metrics.score) {
        preTwrFix.score = metrics.score;
        metrics.score = computeBacktestScore({
          p10: { cagr: metrics.p10.cagr, sharpe: metrics.p10.sharpe, maxDrawdown: metrics.p10.maxDrawdownEquity },
          p50: { cagr: metrics.p50.cagr, sharpe: metrics.p50.sharpe },
          p90: { cagr: metrics.p90.cagr, sharpe: metrics.p90.sharpe, maxDrawdown: metrics.p90.maxDrawdownEquity },
          marginCallCount: metrics.marginCallCount ?? 0,
        });
        console.log(`${tag}  score ${Math.round((preTwrFix.score as { composite: number }).composite)} -> ${Math.round(metrics.score.composite)}`);
      }
      metrics.preTwrFix = preTwrFix;

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
  console.log(`Already backfilled: ${alreadyDone}`);
  console.log(`Already time-weighted (saved after the fix): ${alreadyCorrect}`);
  console.log(`Skipped: ${skipped}`);
}

if (require.main === module) main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
