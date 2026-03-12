/**
 * Large Portfolio Exploration (6-8 assets)
 *
 * Uses a slot-based approach to keep combinations manageable:
 * instead of freely combining 38 assets, each portfolio must fill
 * specific asset-class slots. This reduces combos from millions to ~13K.
 *
 * Slots:
 *   1. US Equity anchor (SPY, QQQ, VTV, VIG, IWM)
 *   2. International/Sector (EFA, XLE, XLV, XLP, VWO, XLF)
 *   3. Gold (GLD — always included)
 *   4. Commodity 2 (SLV, DBC, DBA, COPX)
 *   5. Bond stable (SHY, IEF, AGG)
 *   6. Bond/Inflation (TLT, TIP, LQD)
 *   7. Crypto (BTC-USD or none)
 *   8. Alternative (VNQ, ICLN, IGF, or none)
 *
 * Usage:
 *   npx ts-node explore-large-portfolios.ts [--profile moderate] [--top 20]
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
  BacktestResult,
  PriceData,
} from "../../apps/frontend/lib/backtest/types";
import {
  RISK_PROFILES,
  type RiskProfileId,
} from "../../apps/backend/src/shared/risk-profiles";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { profile: RiskProfileId; top: number; windowOverride?: number } {
  const args = process.argv.slice(2);
  let profile: RiskProfileId = "moderate";
  let top = 20;
  let windowOverride: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[++i] as RiskProfileId;
    } else if (args[i] === "--top" && args[i + 1]) {
      top = parseInt(args[++i], 10);
    } else if (args[i] === "--window" && args[i + 1]) {
      windowOverride = parseInt(args[++i], 10);
    }
  }

  if (!RISK_PROFILES[profile]) {
    console.error(
      `Invalid profile: ${profile}. Valid: conservative, moderate, growth, aggressive`
    );
    process.exit(1);
  }

  return { profile, top, windowOverride };
}

// ---------------------------------------------------------------------------
// Slot-based asset universe
// ---------------------------------------------------------------------------

const SLOTS = {
  usEquity: ["SPY", "QQQ", "VTV", "VIG", "IWM"],
  intlSector: ["EFA", "XLE", "XLV", "XLP", "VWO", "XLF"],
  gold: ["GLD"], // always included
  commodity2: ["SLV", "DBC", "DBA", "COPX"],
  bondStable: ["SHY", "IEF", "AGG"],
  bondInflation: ["TLT", "TIP", "LQD"],
  crypto: ["BTC-USD", "__NONE__"],
  alternative: ["VNQ", "ICLN", "IGF", "__NONE__"],
};

function generateSlotCombos(): string[][] {
  const combos: string[][] = [];

  for (const eq of SLOTS.usEquity) {
    for (const sec of SLOTS.intlSector) {
      for (const gld of SLOTS.gold) {
        for (const com of SLOTS.commodity2) {
          for (const b1 of SLOTS.bondStable) {
            for (const b2 of SLOTS.bondInflation) {
              for (const cry of SLOTS.crypto) {
                for (const alt of SLOTS.alternative) {
                  const symbols = [eq, sec, gld, com, b1, b2];
                  if (cry !== "__NONE__") symbols.push(cry);
                  if (alt !== "__NONE__") symbols.push(alt);

                  // Skip if less than 6 assets (shouldn't happen with mandatory slots)
                  if (symbols.length < 6) continue;

                  // Check no duplicates
                  if (new Set(symbols).size !== symbols.length) continue;

                  combos.push(symbols);
                }
              }
            }
          }
        }
      }
    }
  }

  return combos;
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

    // Margin call penalty
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
  const { profile, top, windowOverride } = parseArgs();
  const riskProfile = RISK_PROFILES[profile];
  const params = riskProfile.params;
  const effectiveWindow = windowOverride ?? params.windowMonths;

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║    Large Portfolio Exploration (Slot-Based)             ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log(`  Profile:     ${profile} (${riskProfile.nameEn})`);
  console.log(`  Leverage:    ${params.leverageMin}x - ${params.leverageMax}x (target ${params.leverageTarget}x)`);
  console.log(`  Window:      ${effectiveWindow} months${windowOverride ? ` (override from ${params.windowMonths})` : ""}`);
  console.log(`  Top results: ${top}\n`);

  // Generate slot combinations
  const allCombos = generateSlotCombos();
  const sizeDistribution = new Map<number, number>();
  for (const c of allCombos) {
    sizeDistribution.set(c.length, (sizeDistribution.get(c.length) || 0) + 1);
  }

  console.log(`  Total combinations: ${allCombos.length.toLocaleString()}`);
  for (const [size, count] of Array.from(sizeDistribution.entries()).sort()) {
    console.log(`    ${size}-asset: ${count.toLocaleString()}`);
  }

  // Collect all unique symbols
  const allSymbols = new Set<string>();
  for (const combo of allCombos) {
    for (const s of combo) allSymbols.add(s);
  }
  console.log(`  Unique symbols: ${allSymbols.size}\n`);

  // Fetch prices
  console.log("── Step 1: Fetching prices ────────────────────────────\n");
  const endDate = new Date().toISOString().split("T")[0];
  const priceCache: PriceData = {};
  const failedSymbols: string[] = [];
  const symbolArr = Array.from(allSymbols);

  for (let i = 0; i < symbolArr.length; i++) {
    const sym = symbolArr[i];
    process.stdout.write(`  [${i + 1}/${symbolArr.length}] ${sym}...`);
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

  // Filter combos to only those with all symbols available
  const validCombos = allCombos.filter(
    (combo) => combo.every((s) => priceCache[s])
  );
  console.log(
    `\n  Valid combinations (all prices available): ${validCombos.length.toLocaleString()}\n`
  );

  // Phase 1: Quick screening with equal weights
  console.log("── Step 2: Phase 1 — Equal weights screening ──────────\n");

  const phase1Results: CandidateResult[] = [];
  let phase1Errors = 0;
  const startPhase1 = Date.now();

  for (let i = 0; i < validCombos.length; i++) {
    if (i % 50 === 0 || i === validCombos.length - 1) {
      printProgress(i + 1, validCombos.length, "Phase 1");
    }

    const symbols = validCombos[i];
    const comboPrices: PriceData = {};
    for (const sym of symbols) comboPrices[sym] = priceCache[sym];

    try {
      const cfg = buildConfig(
        symbols,
        profile,
        "equal",
        false,
        PRICE_START_DATE,
        endDate,
        windowOverride
      );
      const result = runBacktest(cfg, comboPrices);
      if (result.totalWindows >= 10) {
        phase1Results.push(extractResult(symbols, "equal", result));
      }
    } catch {
      phase1Errors++;
    }
  }

  const phase1Time = ((Date.now() - startPhase1) / 1000).toFixed(1);
  console.log(
    `\n  Completed: ${phase1Results.length.toLocaleString()} backtests in ${phase1Time}s`
  );
  if (phase1Errors > 0) console.log(`  Errors: ${phase1Errors}`);

  const zeroMC = phase1Results.filter((c) => c.marginCallCount === 0);
  console.log(
    `  Zero margin calls: ${zeroMC.length.toLocaleString()} / ${phase1Results.length.toLocaleString()}`
  );

  // Score and select top candidates for phase 2
  const pool = zeroMC.length > 0 ? zeroMC : phase1Results;
  const scored1 = scoreResults(pool, profile);
  scored1.sort((a, b) => b.composite - a.composite);

  const maxPhase2 = 200;
  // Select top unique symbol combos for phase 2
  const phase2Set = new Set<string>();
  const phase2Symbols: string[][] = [];
  for (const r of scored1) {
    const key = [...r.symbols].sort().join(",");
    if (!phase2Set.has(key)) {
      phase2Set.add(key);
      phase2Symbols.push(r.symbols);
      if (phase2Symbols.length >= maxPhase2) break;
    }
  }

  console.log(`  Selected for Phase 2: ${phase2Symbols.length} unique combos\n`);

  // Phase 2: Sharpe optimization on top candidates
  console.log("── Step 3: Phase 2 — Sharpe optimization ──────────────\n");

  const allResults: CandidateResult[] = [...scored1.filter((r) => {
    const key = [...r.symbols].sort().join(",");
    return phase2Set.has(key);
  })];

  const startPhase2 = Date.now();
  const weightModes: Array<{
    mode: "equal" | "sharpe";
    dynamic: boolean;
    label: string;
  }> = [
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
        const cfg = buildConfig(
          symbols,
          profile,
          wm.mode,
          wm.dynamic,
          PRICE_START_DATE,
          endDate,
          windowOverride
        );
        const result = runBacktest(cfg, comboPrices);
        if (result.totalWindows >= 10) {
          allResults.push(extractResult(symbols, wm.label, result));
        }
      } catch {
        // Skip failed
      }
    }
  }

  const phase2Time = ((Date.now() - startPhase2) / 1000).toFixed(1);
  console.log(`\n  Phase 2 completed in ${phase2Time}s`);
  console.log(`  Total results: ${allResults.length}\n`);

  // Final scoring
  console.log("── Step 4: Final scoring and ranking ──────────────────\n");

  const finalScored = scoreResults(allResults, profile);
  finalScored.sort((a, b) => b.composite - a.composite);

  // Print top results
  const topResults = finalScored.slice(0, top);

  console.log("=".repeat(220));
  console.log(
    `  ${profile.toUpperCase()} (${params.leverageMin}x-${params.leverageMax}x) — Top ${top} large portfolios`
  );
  console.log("=".repeat(220));
  console.log(
    "  #  │ Score │ Cons │ Prot │ Shrp │  DD  │ Retn │ Asym │ RskR │ Size │ Mode           │ MC │ P50 CAGR │ P10 MaxDD │ P50 Shrp │ Assets"
  );
  console.log("─".repeat(220));

  for (let i = 0; i < topResults.length; i++) {
    const r = topResults[i];
    const num = String(i + 1).padStart(3);
    const cs = r.composite.toFixed(1).padStart(5);
    const c1 = r.scores.consistency.toFixed(0).padStart(4);
    const c2 = r.scores.worstCase.toFixed(0).padStart(4);
    const c3 = r.scores.sharpeQuality.toFixed(0).padStart(4);
    const c4 = r.scores.drawdownCtrl.toFixed(0).padStart(4);
    const c5 = r.scores.returnPotential.toFixed(0).padStart(4);
    const c6 = r.scores.upsideAsymmetry.toFixed(0).padStart(4);
    const c7 = r.scores.riskAdjReturn.toFixed(0).padStart(4);
    const size = String(r.size).padStart(4);
    const mode = r.weightMode.padEnd(14);
    const mc = String(r.marginCallCount).padStart(2);
    const p50c = (r.p50.cagr * 100).toFixed(1).padStart(7) + "%";
    const p10d = (r.p10.maxDrawdown * 100).toFixed(1).padStart(8) + "%";
    const p50s = r.p50.sharpe.toFixed(2).padStart(8);
    const assets = r.symbols.join(", ");

    console.log(
      `  ${num} │ ${cs} │ ${c1} │ ${c2} │ ${c3} │ ${c4} │ ${c5} │ ${c6} │ ${c7} │ ${size} │ ${mode} │ ${mc} │ ${p50c} │ ${p10d} │ ${p50s} │ ${assets}`
    );
  }
  console.log("=".repeat(220));

  // Asset frequency in top results
  console.log("\n  Asset frequency in top results:");
  const freq = new Map<string, number>();
  for (const r of topResults) {
    for (const s of r.symbols) freq.set(s, (freq.get(s) || 0) + 1);
  }
  const sorted = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]);
  for (const [sym, count] of sorted) {
    const bar = "█".repeat(count);
    console.log(`    ${sym.padEnd(10)} ${bar} (${count})`);
  }

  // Save results
  const windowSuffix = windowOverride ? `-w${windowOverride}` : "";
  const outputFile = join(
    __dirname,
    `exploration-large-${profile}${windowSuffix}-${new Date().toISOString().split("T")[0]}.json`
  );

  const output = {
    metadata: {
      profile,
      effectiveWindowMonths: effectiveWindow,
      riskParams: params,
      generatedAt: new Date().toISOString(),
      priceRange: { from: PRICE_START_DATE, to: endDate },
      slots: SLOTS,
      failedSymbols,
      phase1: {
        totalCombos: validCombos.length,
        successfulBacktests: phase1Results.length,
        zeroMarginCalls: zeroMC.length,
        selectedForPhase2: phase2Symbols.length,
        timeSeconds: parseFloat(phase1Time),
      },
      phase2: {
        totalResults: allResults.length,
        timeSeconds: parseFloat(phase2Time),
      },
      scoring: {
        dimensions: [
          "consistency",
          "worstCase",
          "sharpeQuality",
          "drawdownCtrl",
          "returnPotential",
          "upsideAsymmetry",
          "riskAdjReturn",
        ],
        weights: PROFILE_WEIGHTS[profile],
      },
    },
    topResults: finalScored.slice(0, 50).map((r, i) => ({
      rank: i + 1,
      ...r,
    })),
    allScoredResults: finalScored.map((r, i) => ({
      rank: i + 1,
      ...r,
    })),
  };

  writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved to: ${outputFile}`);
}

main().catch(console.error);
