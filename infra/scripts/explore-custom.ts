/**
 * Custom Asset Exploration
 *
 * Explores all 6-8 asset combinations from a given list of symbols
 * across all 4 risk profiles. Much simpler than the slot-based approach
 * since the asset universe is small (~375 combos).
 *
 * Usage:
 *   npx ts-node explore-custom.ts [--top 15] [--window 60]
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";

if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "../../apps/backend/.env") });
}

import { runBacktest } from "../../apps/frontend/lib/backtest/engine/backtest-engine";
import type {
  BacktestConfig,
  PriceData,
  BacktestResult,
} from "../../apps/frontend/lib/backtest/types";
import {
  RISK_PROFILES,
  type RiskProfileId,
} from "../../apps/backend/src/shared/risk-profiles";

// ---------------------------------------------------------------------------
// Asset universe
// ---------------------------------------------------------------------------

const SYMBOLS = [
  "BTC-USD", "GLD", "SLV", "PPLT", "TLT", "QQQ", "SPY", "URA", "SCHD", "DIA",
];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { top: number; windowOverride?: number } {
  const args = process.argv.slice(2);
  let top = 15;
  let windowOverride: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--top" && args[i + 1]) {
      top = parseInt(args[++i], 10);
    } else if (args[i] === "--window" && args[i + 1]) {
      windowOverride = parseInt(args[++i], 10);
    }
  }

  return { top, windowOverride };
}

// ---------------------------------------------------------------------------
// Combination generator
// ---------------------------------------------------------------------------

function combinations(arr: string[], k: number): string[][] {
  const result: string[][] = [];
  function backtrack(start: number, current: string[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

// ---------------------------------------------------------------------------
// Price fetching
// ---------------------------------------------------------------------------

const PRICE_START_DATE = "2015-01-01";
const BACKTEST_INITIAL_CAPITAL = 10000;
const BACKTEST_MONTHLY_CONTRIBUTION = 1000;
const BACKTEST_RISK_FREE_RATE = 0.02;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFromYahoo(
  symbol: string,
  from: string,
  to: string,
  retries = 3
): Promise<Record<string, number>> {
  const startTs = Math.floor(new Date(from).getTime() / 1000);
  const endTs = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        if (attempt < retries) {
          await delay(2000 * attempt);
          continue;
        }
        throw new Error(`Yahoo ${response.status} for ${symbol}`);
      }

      const data = (await response.json()) as any;
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp) throw new Error(`No data for ${symbol}`);

      const timestamps: number[] = result.timestamp;
      const closes: number[] =
        result.indicators.adjclose?.[0]?.adjclose ||
        result.indicators.quote?.[0]?.close;

      const prices: Record<string, number> = {};
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          const date = new Date(timestamps[i] * 1000)
            .toISOString()
            .split("T")[0];
          prices[date] = closes[i];
        }
      }

      return prices;
    } catch (e) {
      if (attempt === retries) throw e;
      await delay(2000 * attempt);
    }
  }

  throw new Error(`Failed after ${retries} retries for ${symbol}`);
}

// ---------------------------------------------------------------------------
// Backtest helpers
// ---------------------------------------------------------------------------

function buildConfig(
  symbols: string[],
  profile: RiskProfileId,
  weightMode: "equal" | "sharpe",
  dynamicWeights: boolean,
  startDate: string,
  endDate: string,
  windowOverride?: number
): BacktestConfig {
  const params = RISK_PROFILES[profile].params;
  const equalWeights: Record<string, number> = {};
  for (const s of symbols) equalWeights[s] = 1 / symbols.length;

  const cfg: BacktestConfig = {
    symbols,
    initialCapital: BACKTEST_INITIAL_CAPITAL,
    monthlyContribution: BACKTEST_MONTHLY_CONTRIBUTION,
    leverageMin: params.leverageMin,
    leverageMax: params.leverageMax,
    leverageTarget: params.leverageTarget,
    startDate,
    endDate,
    windowMonths: windowOverride ?? params.windowMonths,
    weightMode,
    meanReturnShrinkage: params.meanReturnShrinkage,
    riskFreeRate: BACKTEST_RISK_FREE_RATE,
    maxWeight: params.maxWeight,
    minWeight: params.minWeight,
    maintenanceMarginRatio: params.maintenanceMarginRatio,
  };

  if (weightMode === "equal") {
    cfg.manualWeights = equalWeights;
    cfg.weightMode = "manual";
  }

  if (dynamicWeights && weightMode === "sharpe") {
    cfg.dynamicWeights = true;
  }

  return cfg;
}

interface CandidateResult {
  symbols: string[];
  size: number;
  weightMode: string;
  weightsUsed: Record<string, number>;
  totalWindows: number;
  marginCallCount: number;
  p10: { cagr: number; sharpe: number; maxDrawdown: number; finalCapital: number };
  p50: { cagr: number; sharpe: number; maxDrawdown: number; finalCapital: number };
  p90: { cagr: number; sharpe: number; maxDrawdown: number; finalCapital: number };
}

function extractResult(
  symbols: string[],
  weightMode: string,
  result: BacktestResult
): CandidateResult {
  const s = (n: number) => (Number.isFinite(n) ? n : 0);
  return {
    symbols,
    size: symbols.length,
    weightMode,
    weightsUsed: result.weightsUsed,
    totalWindows: result.totalWindows,
    marginCallCount: result.marginCallCount,
    p10: {
      cagr: s(result.p10.cagr),
      sharpe: s(result.p10.sharpe),
      maxDrawdown: result.p10.maxDrawdownEquity,
      finalCapital: result.p10.finalCapital,
    },
    p50: {
      cagr: s(result.p50.cagr),
      sharpe: s(result.p50.sharpe),
      maxDrawdown: result.p50.maxDrawdownEquity,
      finalCapital: result.p50.finalCapital,
    },
    p90: {
      cagr: s(result.p90.cagr),
      sharpe: s(result.p90.sharpe),
      maxDrawdown: result.p90.maxDrawdownEquity,
      finalCapital: result.p90.finalCapital,
    },
  };
}

// ---------------------------------------------------------------------------
// Profile-aware scoring (7 dimensions)
// ---------------------------------------------------------------------------

const PROFILE_WEIGHTS: Record<RiskProfileId, number[]> = {
  //                    consist  worst  sharpe  ddCtrl  return  asymm  riskAdj
  conservative:       [ 0.20,   0.20,  0.20,   0.15,   0.10,   0.05,  0.10 ],
  moderate:           [ 0.12,   0.12,  0.15,   0.08,   0.20,   0.15,  0.18 ],
  growth:             [ 0.08,   0.08,  0.10,   0.04,   0.25,   0.25,  0.20 ],
  aggressive:         [ 0.05,   0.05,  0.08,   0.02,   0.30,   0.30,  0.20 ],
};

function computeRawScores(r: CandidateResult) {
  const p50Cagr = Math.abs(r.p50.cagr) > 0.001 ? r.p50.cagr : 0.001;
  const cagrCV = Math.min(10, (r.p90.cagr - r.p10.cagr) / Math.abs(p50Cagr));
  const sharpeConsist = r.p90.sharpe > 0
    ? Math.max(0, Math.min(1, r.p10.sharpe / r.p90.sharpe))
    : 0;
  const ddSpread = Math.abs(r.p10.maxDrawdown) - Math.abs(r.p90.maxDrawdown);
  const dispersion = 0.4 * cagrCV + 0.3 * (1 - sharpeConsist) + 0.3 * ddSpread;

  const p10DD = Math.abs(r.p10.maxDrawdown);
  const p50DD = Math.abs(r.p50.maxDrawdown);

  return {
    consistency: -dispersion,
    worstCase: p10DD > 0 ? r.p10.cagr / p10DD : 0,
    sharpeQuality: 0.6 * r.p10.sharpe + 0.4 * r.p50.sharpe,
    drawdownCtrl: -p10DD,
    returnPotential: r.p50.cagr,
    upsideAsymmetry: p10DD > 0 ? r.p90.cagr / p10DD : 0,
    riskAdjReturn: p50DD > 0 ? r.p50.cagr / p50DD : 0,
  };
}

function pctRank(values: number[]): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 50);
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  for (let rank = 0; rank < n; rank++) {
    ranks[indexed[rank].i] = (rank / (n - 1)) * 100;
  }
  return ranks;
}

interface ScoredResult extends CandidateResult {
  scores: {
    consistency: number;
    worstCase: number;
    sharpeQuality: number;
    drawdownCtrl: number;
    returnPotential: number;
    upsideAsymmetry: number;
    riskAdjReturn: number;
  };
  composite: number;
}

function scoreResults(
  results: CandidateResult[],
  profile: RiskProfileId
): ScoredResult[] {
  if (results.length === 0) return [];

  const raws = results.map(computeRawScores);
  const dims = [
    "consistency", "worstCase", "sharpeQuality", "drawdownCtrl",
    "returnPotential", "upsideAsymmetry", "riskAdjReturn",
  ] as const;

  const ranked: Record<string, number[]> = {};
  for (const dim of dims) {
    ranked[dim] = pctRank(raws.map((r) => r[dim]));
  }

  const weights = PROFILE_WEIGHTS[profile];

  return results.map((r, i) => {
    const scores = {
      consistency: ranked.consistency[i],
      worstCase: ranked.worstCase[i],
      sharpeQuality: ranked.sharpeQuality[i],
      drawdownCtrl: ranked.drawdownCtrl[i],
      returnPotential: ranked.returnPotential[i],
      upsideAsymmetry: ranked.upsideAsymmetry[i],
      riskAdjReturn: ranked.riskAdjReturn[i],
    };

    let composite =
      weights[0] * scores.consistency +
      weights[1] * scores.worstCase +
      weights[2] * scores.sharpeQuality +
      weights[3] * scores.drawdownCtrl +
      weights[4] * scores.returnPotential +
      weights[5] * scores.upsideAsymmetry +
      weights[6] * scores.riskAdjReturn;

    if (r.marginCallCount > 0) {
      const cap =
        profile === "conservative" || profile === "moderate" ? 30 : 50;
      composite = Math.min(composite, cap);
    }

    return { ...r, scores, composite };
  });
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

function printProgress(current: number, total: number, label: string) {
  const pct = Math.round((current / total) * 100);
  const barLen = 30;
  const filled = Math.round((current / total) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% (${current}/${total})`);
  if (current === total) process.stdout.write("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { top, windowOverride } = parseArgs();

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    Custom Asset Exploration                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log(`  Assets:      ${SYMBOLS.join(", ")}`);
  console.log(`  Top results: ${top}`);
  if (windowOverride) console.log(`  Window:      ${windowOverride} months (override)`);

  // Generate all 6-8 asset combinations
  const allCombos = [
    ...combinations(SYMBOLS, 6),
    ...combinations(SYMBOLS, 7),
    ...combinations(SYMBOLS, 8),
  ];
  console.log(`\n  Total combinations: ${allCombos.length}`);
  console.log(`    6-asset: ${combinations(SYMBOLS, 6).length}`);
  console.log(`    7-asset: ${combinations(SYMBOLS, 7).length}`);
  console.log(`    8-asset: ${combinations(SYMBOLS, 8).length}`);

  // Fetch prices
  console.log("\n── Fetching prices ────────────────────────────────────\n");
  const endDate = new Date().toISOString().split("T")[0];
  const priceCache: PriceData = {};
  const failedSymbols: string[] = [];

  for (let i = 0; i < SYMBOLS.length; i++) {
    const sym = SYMBOLS[i];
    process.stdout.write(`  [${i + 1}/${SYMBOLS.length}] ${sym}...`);
    try {
      const prices = await fetchFromYahoo(sym, PRICE_START_DATE, endDate);
      const dayCount = Object.keys(prices).length;
      if (dayCount < 200) {
        failedSymbols.push(sym);
        console.log(` ${dayCount} days (insufficient) ✗`);
      } else {
        priceCache[sym] = prices;
        console.log(` ${dayCount} days ✓`);
      }
    } catch {
      failedSymbols.push(sym);
      console.log(` FAILED ✗`);
    }
    await delay(400);
  }

  if (failedSymbols.length > 0) {
    console.log(`\n  ⚠ Failed/insufficient: ${failedSymbols.join(", ")}`);
  }

  // Filter combos
  const validCombos = allCombos.filter(
    (combo) => combo.every((s) => priceCache[s])
  );
  console.log(`\n  Valid combinations: ${validCombos.length}\n`);

  // Run for each profile
  const profiles: RiskProfileId[] = ["conservative", "moderate", "growth", "aggressive"];
  const allProfileResults: Record<string, ScoredResult[]> = {};

  for (const profile of profiles) {
    const riskProfile = RISK_PROFILES[profile];
    const params = riskProfile.params;
    const effectiveWindow = windowOverride ?? params.windowMonths;

    console.log("═".repeat(120));
    console.log(`  ${profile.toUpperCase()} (${params.leverageMin}x-${params.leverageMax}x, target ${params.leverageTarget}x, ${effectiveWindow}mo)`);
    console.log("═".repeat(120));

    // Phase 1: Equal weights screening
    console.log("\n  Phase 1: Equal weights screening");
    const phase1Results: CandidateResult[] = [];
    const startPhase1 = Date.now();

    for (let i = 0; i < validCombos.length; i++) {
      if (i % 50 === 0 || i === validCombos.length - 1) {
        printProgress(i + 1, validCombos.length, "Phase 1");
      }

      const symbols = validCombos[i];
      const comboPrices: PriceData = {};
      for (const sym of symbols) comboPrices[sym] = priceCache[sym];

      try {
        const cfg = buildConfig(symbols, profile, "equal", false, PRICE_START_DATE, endDate, windowOverride);
        const result = runBacktest(cfg, comboPrices);
        if (result.totalWindows >= 10) {
          phase1Results.push(extractResult(symbols, "equal", result));
        }
      } catch {
        // skip
      }
    }

    const phase1Time = ((Date.now() - startPhase1) / 1000).toFixed(1);
    const zeroMC = phase1Results.filter((c) => c.marginCallCount === 0);
    console.log(`  ${phase1Results.length} backtests in ${phase1Time}s | 0 MC: ${zeroMC.length}/${phase1Results.length}`);

    // Select top for Phase 2
    const pool = zeroMC.length > 0 ? zeroMC : phase1Results;
    const scored1 = scoreResults(pool, profile);
    scored1.sort((a, b) => b.composite - a.composite);

    const phase2Set = new Set<string>();
    const phase2Symbols: string[][] = [];
    for (const r of scored1) {
      const key = [...r.symbols].sort().join(",");
      if (!phase2Set.has(key)) {
        phase2Set.add(key);
        phase2Symbols.push(r.symbols);
        if (phase2Symbols.length >= 100) break;
      }
    }

    // Phase 2: Sharpe optimization
    console.log(`\n  Phase 2: Sharpe optimization on top ${phase2Symbols.length} combos`);
    const allResults: CandidateResult[] = [...scored1.filter((r) => {
      const key = [...r.symbols].sort().join(",");
      return phase2Set.has(key);
    })];

    const startPhase2 = Date.now();
    const weightModes: Array<{ mode: "equal" | "sharpe"; dynamic: boolean; label: string }> = [
      { mode: "sharpe", dynamic: false, label: "sharpe" },
      { mode: "sharpe", dynamic: true, label: "sharpe_dynamic" },
    ];

    for (let i = 0; i < phase2Symbols.length; i++) {
      if (i % 10 === 0 || i === phase2Symbols.length - 1) {
        printProgress(i + 1, phase2Symbols.length, "Phase 2");
      }

      const symbols = phase2Symbols[i];
      const comboPrices: PriceData = {};
      for (const sym of symbols) comboPrices[sym] = priceCache[sym];

      for (const wm of weightModes) {
        try {
          const cfg = buildConfig(symbols, profile, wm.mode, wm.dynamic, PRICE_START_DATE, endDate, windowOverride);
          const result = runBacktest(cfg, comboPrices);
          if (result.totalWindows >= 10) {
            allResults.push(extractResult(symbols, wm.label, result));
          }
        } catch {
          // skip
        }
      }
    }

    const phase2Time = ((Date.now() - startPhase2) / 1000).toFixed(1);
    console.log(`  Phase 2 done in ${phase2Time}s | Total results: ${allResults.length}`);

    // Final scoring
    const finalScored = scoreResults(allResults, profile);
    finalScored.sort((a, b) => b.composite - a.composite);
    allProfileResults[profile] = finalScored;

    // Print top results
    const topResults = finalScored.slice(0, top);

    console.log(`\n  Top ${top}:`);
    console.log(
      "  #  │ Score │ MC │ Win │ P10 CAGR │ P50 CAGR │ P90 CAGR │ P10 MaxDD │ P50 Shrp │ Mode           │ Assets"
    );
    console.log("─".repeat(150));

    for (let i = 0; i < topResults.length; i++) {
      const r = topResults[i];
      const num = String(i + 1).padStart(3);
      const cs = r.composite.toFixed(1).padStart(5);
      const mc = String(r.marginCallCount).padStart(2);
      const win = String(r.totalWindows).padStart(3);
      const p10c = (r.p10.cagr * 100).toFixed(1).padStart(7) + "%";
      const p50c = (r.p50.cagr * 100).toFixed(1).padStart(7) + "%";
      const p90c = (r.p90.cagr * 100).toFixed(1).padStart(7) + "%";
      const p10d = (r.p10.maxDrawdown * 100).toFixed(1).padStart(8) + "%";
      const p50s = r.p50.sharpe.toFixed(2).padStart(8);
      const mode = r.weightMode.padEnd(14);
      const assets = r.symbols.join(", ");

      console.log(
        `  ${num} │ ${cs} │ ${mc} │ ${win} │ ${p10c} │ ${p50c} │ ${p90c} │ ${p10d} │ ${p50s} │ ${mode} │ ${assets}`
      );
    }

    // Asset frequency
    console.log(`\n  Asset frequency in top ${top}:`);
    const freq = new Map<string, number>();
    for (const r of topResults) {
      for (const s of r.symbols) freq.set(s, (freq.get(s) || 0) + 1);
    }
    const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
    for (const [sym, count] of sorted) {
      const bar = "█".repeat(count);
      console.log(`    ${sym.padEnd(10)} ${bar} (${count})`);
    }
    console.log("");
  }

  // Save results
  const outputFile = join(
    __dirname,
    `exploration-custom-${new Date().toISOString().split("T")[0]}.json`
  );

  const output = {
    metadata: {
      symbols: SYMBOLS,
      generatedAt: new Date().toISOString(),
      priceRange: { from: PRICE_START_DATE, to: endDate },
      windowOverride,
      failedSymbols,
      totalCombinations: validCombos.length,
    },
    results: Object.fromEntries(
      Object.entries(allProfileResults).map(([profile, results]) => [
        profile,
        results.slice(0, 30).map((r, i) => ({ rank: i + 1, ...r })),
      ])
    ),
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${outputFile}`);
}

main().catch(console.error);
