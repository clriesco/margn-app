/**
 * Portfolio Exploration & Optimization Script
 *
 * Systematically explores thousands of portfolio compositions across a broad
 * asset universe to find optimal portfolios for a given risk profile.
 *
 * Two-phase approach:
 *   Phase 1: Quick screening with equal weights (~15-25k combos)
 *   Phase 2: Deep optimization with Sharpe weights on top candidates
 *
 * Prioritizes: zero margin calls, low P10-P90 dispersion, high CAGR/drawdown
 * ratio, high Sharpe.
 *
 * Usage:
 *   npx ts-node explore-portfolios.ts [--profile moderate] [--max-phase2 300] [--top 30] [--sizes 3,4]
 */

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { join } from "path";

// Load environment variables from backend .env (only in development)
if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "../../apps/backend/.env") });
}

import { PrismaClient } from "@prisma/client";
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

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): {
  profile: RiskProfileId;
  maxPhase2: number;
  top: number;
  sizes: number[];
} {
  const args = process.argv.slice(2);
  let profile: RiskProfileId = "moderate";
  let maxPhase2 = 300;
  let top = 30;
  let sizes = [3, 4];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--profile" && args[i + 1]) {
      profile = args[++i] as RiskProfileId;
    } else if (args[i] === "--max-phase2" && args[i + 1]) {
      maxPhase2 = parseInt(args[++i], 10);
    } else if (args[i] === "--top" && args[i + 1]) {
      top = parseInt(args[++i], 10);
    } else if (args[i] === "--sizes" && args[i + 1]) {
      sizes = args[++i].split(",").map((s) => parseInt(s, 10));
    }
  }

  if (!RISK_PROFILES[profile]) {
    console.error(`Invalid profile: ${profile}. Valid: conservative, moderate, growth, aggressive`);
    process.exit(1);
  }

  return { profile, maxPhase2, top, sizes };
}

// ---------------------------------------------------------------------------
// Asset Universe
// ---------------------------------------------------------------------------

interface AssetDef {
  symbol: string;
  name: string;
  assetClass: string;
  correlationGroup: string;
}

const ASSET_UNIVERSE: AssetDef[] = [
  // US Equity (6)
  { symbol: "SPY", name: "S&P 500", assetClass: "us_equity", correlationGroup: "us_large" },
  { symbol: "QQQ", name: "Nasdaq 100", assetClass: "us_equity", correlationGroup: "us_large" },
  { symbol: "IWM", name: "Russell 2000", assetClass: "us_equity", correlationGroup: "IWM" },
  { symbol: "VTV", name: "Value", assetClass: "us_equity", correlationGroup: "VTV" },
  { symbol: "USMV", name: "Min Vol", assetClass: "us_equity", correlationGroup: "USMV" },
  { symbol: "VIG", name: "Dividend Growth", assetClass: "us_equity", correlationGroup: "VIG" },

  // International Equity (5)
  { symbol: "EFA", name: "Developed ex-US", assetClass: "intl_equity", correlationGroup: "EFA" },
  { symbol: "VWO", name: "Emerging Markets", assetClass: "intl_equity", correlationGroup: "VWO" },
  { symbol: "FXI", name: "China", assetClass: "intl_equity", correlationGroup: "FXI" },
  { symbol: "EWZ", name: "Brazil", assetClass: "intl_equity", correlationGroup: "EWZ" },
  { symbol: "INDA", name: "India", assetClass: "intl_equity", correlationGroup: "INDA" },

  // Sector Equity (7)
  { symbol: "XLE", name: "Energy", assetClass: "sector_equity", correlationGroup: "XLE" },
  { symbol: "XLV", name: "Healthcare", assetClass: "sector_equity", correlationGroup: "XLV" },
  { symbol: "XLF", name: "Financials", assetClass: "sector_equity", correlationGroup: "XLF" },
  { symbol: "XLU", name: "Utilities", assetClass: "sector_equity", correlationGroup: "XLU" },
  { symbol: "XLP", name: "Consumer Staples", assetClass: "sector_equity", correlationGroup: "XLP" },
  { symbol: "XLI", name: "Industrials", assetClass: "sector_equity", correlationGroup: "XLI" },
  { symbol: "XLB", name: "Materials", assetClass: "sector_equity", correlationGroup: "XLB" },

  // Bonds (8)
  { symbol: "TLT", name: "Long Treasury 20+yr", assetClass: "bonds", correlationGroup: "TLT" },
  { symbol: "IEF", name: "Mid Treasury 7-10yr", assetClass: "bonds", correlationGroup: "IEF" },
  { symbol: "SHY", name: "Short Treasury 1-3yr", assetClass: "bonds", correlationGroup: "SHY" },
  { symbol: "TIP", name: "TIPS", assetClass: "bonds", correlationGroup: "TIP" },
  { symbol: "LQD", name: "IG Corporate", assetClass: "bonds", correlationGroup: "LQD" },
  { symbol: "HYG", name: "High Yield", assetClass: "bonds", correlationGroup: "HYG" },
  { symbol: "EMB", name: "EM Bonds", assetClass: "bonds", correlationGroup: "EMB" },
  { symbol: "AGG", name: "Aggregate", assetClass: "bonds", correlationGroup: "AGG" },

  // Commodities (6)
  { symbol: "GLD", name: "Gold", assetClass: "commodities", correlationGroup: "GLD" },
  { symbol: "SLV", name: "Silver", assetClass: "commodities", correlationGroup: "SLV" },
  { symbol: "DBC", name: "Broad Commodities", assetClass: "commodities", correlationGroup: "DBC" },
  { symbol: "DBA", name: "Agriculture", assetClass: "commodities", correlationGroup: "DBA" },
  { symbol: "COPX", name: "Copper Miners", assetClass: "commodities", correlationGroup: "COPX" },
  { symbol: "GDX", name: "Gold Miners", assetClass: "commodities", correlationGroup: "GDX" },

  // Crypto (2)
  { symbol: "BTC-USD", name: "Bitcoin", assetClass: "crypto", correlationGroup: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", assetClass: "crypto", correlationGroup: "crypto" },

  // Alternatives (4)
  { symbol: "VNQ", name: "REITs", assetClass: "alternatives", correlationGroup: "VNQ" },
  { symbol: "AMLP", name: "MLPs/Pipelines", assetClass: "alternatives", correlationGroup: "AMLP" },
  { symbol: "ICLN", name: "Clean Energy", assetClass: "alternatives", correlationGroup: "ICLN" },
  { symbol: "IGF", name: "Infrastructure", assetClass: "alternatives", correlationGroup: "IGF" },
];

// Safe-haven symbols (required if crypto is in the portfolio)
const SAFE_HAVENS = new Set(["TLT", "IEF", "SHY", "AGG", "GLD", "TIP"]);

// ---------------------------------------------------------------------------
// Price fetching (reused from seed-platform-strategies.ts pattern)
// ---------------------------------------------------------------------------

const PRICE_START_DATE = "2015-01-01";
const BACKTEST_INITIAL_CAPITAL = 10000;
const BACKTEST_MONTHLY_CONTRIBUTION = 1000;
const BACKTEST_RISK_FREE_RATE = 0.02;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function guessAssetType(symbol: string): string {
  if (symbol.includes("-USD")) return "crypto";
  const def = ASSET_UNIVERSE.find((a) => a.symbol === symbol);
  if (!def) return "index";
  if (def.assetClass === "bonds") return "bond";
  if (def.assetClass === "commodities") return "commodity";
  return "index";
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
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();
      const chartResult = data.chart?.result?.[0];
      if (!chartResult?.timestamp) {
        throw new Error("No price data returned");
      }

      const timestamps: number[] = chartResult.timestamp;
      const adjCloses: number[] | undefined =
        chartResult.indicators?.adjclose?.[0]?.adjclose;
      const closes: number[] | undefined =
        chartResult.indicators?.quote?.[0]?.close;
      const priceArray = adjCloses || closes;
      if (!priceArray) {
        throw new Error("No price array in response");
      }

      const result: Record<string, number> = {};
      for (let i = 0; i < timestamps.length; i++) {
        const price = priceArray[i];
        if (price == null || price <= 0) continue;
        const date = new Date(timestamps[i] * 1000);
        date.setUTCHours(0, 0, 0, 0);
        result[date.toISOString().split("T")[0]] = price;
      }

      return result;
    } catch (err) {
      if (attempt === retries) {
        throw new Error(
          `Yahoo Finance failed for ${symbol} after ${retries} attempts: ${err instanceof Error ? err.message : err}`
        );
      }
      const backoff = Math.pow(2, attempt) * 500;
      await delay(backoff);
    }
  }

  return {}; // unreachable
}

async function ensureAsset(symbol: string): Promise<string> {
  let asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) {
    asset = await prisma.asset.create({
      data: { symbol, name: symbol, assetType: guessAssetType(symbol) },
    });
  }
  return asset.id;
}

async function cachePricesToDb(
  assetId: string,
  prices: Record<string, number>
): Promise<void> {
  const entries = Object.entries(prices);
  const CHUNK_SIZE = 500;
  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    await prisma.assetPrice.createMany({
      data: chunk.map(([dateStr, price]) => ({
        assetId,
        date: new Date(dateStr),
        close: price,
        adjClose: price,
        source: "yfinance",
      })),
      skipDuplicates: true,
    });
  }
}

async function getPricesForSymbol(
  symbol: string,
  from: string,
  to: string,
  minDays: number
): Promise<Record<string, number>> {
  const assetId = await ensureAsset(symbol);

  const cached = await prisma.assetPrice.findMany({
    where: {
      assetId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    orderBy: { date: "asc" },
  });

  if (cached.length >= minDays) {
    const result: Record<string, number> = {};
    for (const p of cached) {
      result[p.date.toISOString().split("T")[0]] = p.close;
    }
    return result;
  }

  const yahooPrices = await fetchFromYahoo(symbol, from, to);
  const dayCount = Object.keys(yahooPrices).length;
  if (dayCount > 0) {
    await cachePricesToDb(assetId, yahooPrices);
  }

  return yahooPrices;
}

// ---------------------------------------------------------------------------
// Combination generation
// ---------------------------------------------------------------------------

/**
 * Generate all k-combinations from the array.
 */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const result: T[][] = [];

  function recurse(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    const remaining = k - current.length;
    for (let i = start; i <= arr.length - remaining; i++) {
      current.push(arr[i]);
      recurse(i + 1, current);
      current.pop();
    }
  }

  recurse(0, []);
  return result;
}

/**
 * Check if a combination is valid according to constraints.
 */
function isValidCombo(assets: AssetDef[], size: number): boolean {
  // Max 1 per correlation group
  const groups = new Set<string>();
  for (const a of assets) {
    if (groups.has(a.correlationGroup)) return false;
    groups.add(a.correlationGroup);
  }

  // Count asset classes
  const classCounts = new Map<string, number>();
  const classSet = new Set<string>();
  for (const a of assets) {
    classSet.add(a.assetClass);
    classCounts.set(a.assetClass, (classCounts.get(a.assetClass) || 0) + 1);
  }

  // Min asset class diversity: 3+ for 4-asset, 2+ for 3-asset
  const minClasses = size >= 4 ? 3 : 2;
  if (classSet.size < minClasses) return false;

  // Max 2 per asset class
  for (const count of Array.from(classCounts.values())) {
    if (count > 2) return false;
  }

  // Crypto requires a safe-haven
  const hasCrypto = assets.some((a) => a.assetClass === "crypto");
  if (hasCrypto) {
    const hasSafeHaven = assets.some((a) => SAFE_HAVENS.has(a.symbol));
    if (!hasSafeHaven) return false;
  }

  return true;
}

function generateCombinations(
  availableAssets: AssetDef[],
  sizes: number[]
): AssetDef[][] {
  const allCombos: AssetDef[][] = [];

  for (const size of sizes) {
    const combos = combinations(availableAssets, size);
    for (const combo of combos) {
      if (isValidCombo(combo, size)) {
        allCombos.push(combo);
      }
    }
  }

  return allCombos;
}

// ---------------------------------------------------------------------------
// Backtest helpers
// ---------------------------------------------------------------------------

function buildBacktestConfig(
  symbols: string[],
  profile: RiskProfileId,
  weightMode: "equal" | "sharpe",
  dynamicWeights: boolean,
  startDate: string,
  endDate: string
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
    windowMonths: params.windowMonths,
    weightMode,
    meanReturnShrinkage: params.meanReturnShrinkage,
    riskFreeRate: BACKTEST_RISK_FREE_RATE,
    maxWeight: params.maxWeight,
    minWeight: params.minWeight,
    maintenanceMarginRatio: params.maintenanceMarginRatio,
  };

  if (weightMode === "equal") {
    cfg.manualWeights = equalWeights;
    // Force manual mode internally so the engine uses our equal weights directly
    cfg.weightMode = "manual";
  }

  if (dynamicWeights && weightMode === "sharpe") {
    cfg.dynamicWeights = true;
  }

  return cfg;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

interface CandidateResult {
  symbols: string[];
  assetClasses: string[];
  weightMode: string; // "equal" | "sharpe" | "sharpe_dynamic"
  weightsUsed: Record<string, number>;
  totalWindows: number;
  marginCallCount: number;
  p10: {
    cagr: number;
    sharpe: number;
    maxDrawdown: number;
    finalCapital: number;
  };
  p50: {
    cagr: number;
    sharpe: number;
    maxDrawdown: number;
    finalCapital: number;
  };
  p90: {
    cagr: number;
    sharpe: number;
    maxDrawdown: number;
    finalCapital: number;
  };
}

interface ScoredCandidate extends CandidateResult {
  compositeScore: number;
  dispersionScore: number;
  worstCaseScore: number;
  sharpeScore: number;
  drawdownScore: number;
}

function extractCandidateResult(
  symbols: string[],
  assetClasses: string[],
  weightMode: string,
  result: BacktestResult
): CandidateResult {
  const safeNum = (n: number) => (Number.isFinite(n) ? n : 0);

  return {
    symbols,
    assetClasses,
    weightMode,
    weightsUsed: result.weightsUsed,
    totalWindows: result.totalWindows,
    marginCallCount: result.marginCallCount,
    p10: {
      cagr: safeNum(result.p10.cagr),
      sharpe: safeNum(result.p10.sharpe),
      maxDrawdown: result.p10.maxDrawdownEquity,
      finalCapital: result.p10.finalCapital,
    },
    p50: {
      cagr: safeNum(result.p50.cagr),
      sharpe: safeNum(result.p50.sharpe),
      maxDrawdown: result.p50.maxDrawdownEquity,
      finalCapital: result.p50.finalCapital,
    },
    p90: {
      cagr: safeNum(result.p90.cagr),
      sharpe: safeNum(result.p90.sharpe),
      maxDrawdown: result.p90.maxDrawdownEquity,
      finalCapital: result.p90.finalCapital,
    },
  };
}

/**
 * Compute raw dimension values for a candidate.
 */
function computeRawDimensions(c: CandidateResult): {
  dispersion: number;
  worstCase: number;
  sharpe: number;
  drawdown: number;
} {
  // Dispersion: lower is better
  const p50Cagr = Math.abs(c.p50.cagr) > 0.001 ? c.p50.cagr : 0.001;
  const cagrCV = Math.min(10, (c.p90.cagr - c.p10.cagr) / Math.abs(p50Cagr));

  const sharpeConsistency =
    c.p90.sharpe > 0 ? Math.max(0, Math.min(1, c.p10.sharpe / c.p90.sharpe)) : 0;

  const drawdownSpread =
    Math.abs(c.p10.maxDrawdown) - Math.abs(c.p90.maxDrawdown);

  const dispersion =
    0.4 * cagrCV + 0.3 * (1 - sharpeConsistency) + 0.3 * drawdownSpread;

  // Worst case: higher is better (CAGR per unit drawdown)
  const p10DD = Math.abs(c.p10.maxDrawdown);
  const worstCase = p10DD > 0 ? c.p10.cagr / p10DD : 0;

  // Sharpe: higher is better (weighted toward P10)
  const sharpe = 0.6 * c.p10.sharpe + 0.4 * c.p50.sharpe;

  // Drawdown: lower is better (absolute P10 max drawdown)
  const drawdown = Math.abs(c.p10.maxDrawdown);

  return { dispersion, worstCase, sharpe, drawdown };
}

/**
 * Percentile-rank normalize an array of values.
 * Returns 0-100 scores where higher is always better.
 */
function percentileRank(values: number[], higherIsBetter: boolean): number[] {
  const n = values.length;
  if (n <= 1) return values.map(() => 50);

  // Create indexed array for sorting
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  for (let rank = 0; rank < n; rank++) {
    const idx = indexed[rank].i;
    ranks[idx] = (rank / (n - 1)) * 100;
  }

  // If lower is better, invert
  if (!higherIsBetter) {
    for (let i = 0; i < n; i++) ranks[i] = 100 - ranks[i];
  }

  return ranks;
}

function scoreAndRank(candidates: CandidateResult[]): ScoredCandidate[] {
  if (candidates.length === 0) return [];

  // Compute raw dimensions
  const raws = candidates.map(computeRawDimensions);

  // Percentile rank each dimension
  const dispersionRanks = percentileRank(
    raws.map((r) => r.dispersion),
    false // lower dispersion is better
  );
  const worstCaseRanks = percentileRank(
    raws.map((r) => r.worstCase),
    true // higher is better
  );
  const sharpeRanks = percentileRank(
    raws.map((r) => r.sharpe),
    true // higher is better
  );
  const drawdownRanks = percentileRank(
    raws.map((r) => r.drawdown),
    false // lower drawdown is better
  );

  // Composite score
  return candidates.map((c, i) => {
    const dispersionScore = dispersionRanks[i];
    const worstCaseScore = worstCaseRanks[i];
    const sharpeScore = sharpeRanks[i];
    const drawdownScore = drawdownRanks[i];

    const compositeScore =
      0.35 * dispersionScore +
      0.25 * worstCaseScore +
      0.25 * sharpeScore +
      0.15 * drawdownScore;

    return {
      ...c,
      compositeScore,
      dispersionScore,
      worstCaseScore,
      sharpeScore,
      drawdownScore,
    };
  });
}

// ---------------------------------------------------------------------------
// Progress display
// ---------------------------------------------------------------------------

function formatPercent(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function formatScore(n: number): string {
  return n.toFixed(1);
}

function printProgressBar(current: number, total: number, label: string) {
  const pct = Math.round((current / total) * 100);
  const barLen = 30;
  const filled = Math.round((current / total) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);
  process.stdout.write(`\r  ${label} [${bar}] ${pct}% (${current}/${total})`);
  if (current === total) process.stdout.write("\n");
}

function printResultsTable(results: ScoredCandidate[], topN: number) {
  const top = results.slice(0, topN);

  console.log("\n" + "=".repeat(160));
  console.log(
    "  #  │ Score │ Disp │ WstC │ Shrp │  DD  │ Mode          │ P10 CAGR │ P50 CAGR │ P90 CAGR │ P10 Shrp │ P10 MaxDD │ MCalls │ Assets"
  );
  console.log("─".repeat(160));

  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const num = String(i + 1).padStart(3);
    const score = formatScore(r.compositeScore).padStart(5);
    const disp = formatScore(r.dispersionScore).padStart(4);
    const wst = formatScore(r.worstCaseScore).padStart(4);
    const shrp = formatScore(r.sharpeScore).padStart(4);
    const dd = formatScore(r.drawdownScore).padStart(4);
    const mode = r.weightMode.padEnd(13);
    const p10cagr = formatPercent(r.p10.cagr).padStart(8);
    const p50cagr = formatPercent(r.p50.cagr).padStart(8);
    const p90cagr = formatPercent(r.p90.cagr).padStart(8);
    const p10sharpe = r.p10.sharpe.toFixed(2).padStart(8);
    const p10dd = formatPercent(r.p10.maxDrawdown).padStart(9);
    const mcalls = String(r.marginCallCount).padStart(6);
    const assets = r.symbols.join(", ");

    console.log(
      ` ${num} │ ${score} │ ${disp} │ ${wst} │ ${shrp} │ ${dd} │ ${mode} │ ${p10cagr} │ ${p50cagr} │ ${p90cagr} │ ${p10sharpe} │ ${p10dd} │ ${mcalls} │ ${assets}`
    );
  }

  console.log("=".repeat(160));
}

// ---------------------------------------------------------------------------
// Main exploration flow
// ---------------------------------------------------------------------------

async function explore() {
  const { profile, maxPhase2, top, sizes } = parseArgs();
  const riskProfile = RISK_PROFILES[profile];

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         Portfolio Exploration & Optimization            ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");
  console.log(`  Profile:     ${profile} (${riskProfile.nameEn})`);
  console.log(`  Leverage:    ${riskProfile.params.leverageMin}x - ${riskProfile.params.leverageMax}x (target ${riskProfile.params.leverageTarget}x)`);
  console.log(`  Window:      ${riskProfile.params.windowMonths} months`);
  console.log(`  Sizes:       ${sizes.join(", ")} assets`);
  console.log(`  Phase 2 cap: ${maxPhase2} candidates`);
  console.log(`  Top results: ${top}\n`);

  // -----------------------------------------------------------------------
  // Step 1: Fetch prices for all symbols
  // -----------------------------------------------------------------------
  console.log("── Step 1: Fetching prices ──────────────────────────────────\n");

  const endDate = new Date().toISOString().split("T")[0];
  const priceCache: PriceData = {};
  const availableAssets: AssetDef[] = [];
  const failedSymbols: string[] = [];

  for (let i = 0; i < ASSET_UNIVERSE.length; i++) {
    const asset = ASSET_UNIVERSE[i];
    printProgressBar(i + 1, ASSET_UNIVERSE.length, "Prices");

    try {
      const prices = await getPricesForSymbol(
        asset.symbol,
        PRICE_START_DATE,
        endDate,
        500
      );
      const dayCount = Object.keys(prices).length;

      if (dayCount < 200) {
        failedSymbols.push(asset.symbol);
        continue;
      }

      priceCache[asset.symbol] = prices;
      availableAssets.push(asset);
    } catch {
      failedSymbols.push(asset.symbol);
    }

    // Rate limit between Yahoo calls
    await delay(400);
  }

  console.log(`\n  Available: ${availableAssets.length} symbols`);
  if (failedSymbols.length > 0) {
    console.log(`  Failed/insufficient: ${failedSymbols.join(", ")}`);
  }

  // -----------------------------------------------------------------------
  // Step 2: Generate combinations
  // -----------------------------------------------------------------------
  console.log("\n── Step 2: Generating combinations ─────────────────────────\n");

  const allCombos = generateCombinations(availableAssets, sizes);
  console.log(`  Valid combinations: ${allCombos.length.toLocaleString()}`);

  if (allCombos.length === 0) {
    console.error("  No valid combinations found. Check asset availability.");
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // Step 3: Phase 1 — Quick screening with equal weights
  // -----------------------------------------------------------------------
  console.log("\n── Step 3: Phase 1 — Equal weights screening ───────────────\n");

  const phase1Results: CandidateResult[] = [];
  let phase1Errors = 0;
  const startPhase1 = Date.now();

  for (let i = 0; i < allCombos.length; i++) {
    if (i % 100 === 0 || i === allCombos.length - 1) {
      printProgressBar(i + 1, allCombos.length, "Phase 1");
    }

    const combo = allCombos[i];
    const symbols = combo.map((a) => a.symbol);
    const assetClasses = Array.from(new Set(combo.map((a) => a.assetClass)));

    // Build price data for this combo
    const comboPrices: PriceData = {};
    let skip = false;
    for (const sym of symbols) {
      if (!priceCache[sym]) { skip = true; break; }
      comboPrices[sym] = priceCache[sym];
    }
    if (skip) continue;

    try {
      const cfg = buildBacktestConfig(
        symbols,
        profile,
        "equal",
        false,
        PRICE_START_DATE,
        endDate
      );

      const result = runBacktest(cfg, comboPrices);

      // Hard filter: minimum windows
      if (result.totalWindows < 10) continue;

      const candidate = extractCandidateResult(
        symbols,
        assetClasses,
        "equal",
        result
      );

      phase1Results.push(candidate);
    } catch {
      phase1Errors++;
    }
  }

  const phase1Time = ((Date.now() - startPhase1) / 1000).toFixed(1);
  console.log(`\n  Completed: ${phase1Results.length.toLocaleString()} successful backtests in ${phase1Time}s`);
  if (phase1Errors > 0) {
    console.log(`  Errors: ${phase1Errors}`);
  }

  // Hard filter: zero margin calls
  const noMarginCall = phase1Results.filter((c) => c.marginCallCount === 0);
  console.log(`  Zero margin calls: ${noMarginCall.length.toLocaleString()} / ${phase1Results.length.toLocaleString()}`);

  if (noMarginCall.length === 0) {
    console.log("\n  WARNING: No portfolios with zero margin calls. Using all results.\n");
  }

  const pool = noMarginCall.length > 0 ? noMarginCall : phase1Results;

  // Quick-score to select top candidates for phase 2
  const quickScored = scoreAndRank(pool);
  quickScored.sort((a, b) => b.compositeScore - a.compositeScore);

  const phase2Candidates = quickScored.slice(0, maxPhase2);
  console.log(`  Selected for Phase 2: ${phase2Candidates.length}`);

  // -----------------------------------------------------------------------
  // Step 4: Phase 2 — Deep optimization (sharpe static + sharpe dynamic)
  // -----------------------------------------------------------------------
  console.log("\n── Step 4: Phase 2 — Sharpe optimization ───────────────────\n");

  const phase2Results: CandidateResult[] = [];
  // Include the phase 1 equal-weight results for the selected candidates
  for (const c of phase2Candidates) {
    phase2Results.push(c);
  }

  let phase2Runs = 0;
  const totalPhase2 = phase2Candidates.length * 2; // sharpe + sharpe_dynamic
  const startPhase2 = Date.now();

  for (let i = 0; i < phase2Candidates.length; i++) {
    const candidate = phase2Candidates[i];
    const symbols = candidate.symbols;

    const comboPrices: PriceData = {};
    for (const sym of symbols) comboPrices[sym] = priceCache[sym];

    // Run sharpe static
    try {
      const cfgSharpe = buildBacktestConfig(
        symbols,
        profile,
        "sharpe",
        false,
        PRICE_START_DATE,
        endDate
      );

      const resultSharpe = runBacktest(cfgSharpe, comboPrices);

      if (resultSharpe.totalWindows >= 10) {
        phase2Results.push(
          extractCandidateResult(
            symbols,
            candidate.assetClasses,
            "sharpe",
            resultSharpe
          )
        );
      }
    } catch {
      // skip
    }
    phase2Runs++;
    printProgressBar(phase2Runs, totalPhase2, "Phase 2");

    // Run sharpe dynamic
    try {
      const cfgDynamic = buildBacktestConfig(
        symbols,
        profile,
        "sharpe",
        true,
        PRICE_START_DATE,
        endDate
      );

      const resultDynamic = runBacktest(cfgDynamic, comboPrices);

      if (resultDynamic.totalWindows >= 10) {
        phase2Results.push(
          extractCandidateResult(
            symbols,
            candidate.assetClasses,
            "sharpe_dynamic",
            resultDynamic
          )
        );
      }
    } catch {
      // skip
    }
    phase2Runs++;
    printProgressBar(phase2Runs, totalPhase2, "Phase 2");
  }

  const phase2Time = ((Date.now() - startPhase2) / 1000).toFixed(1);
  console.log(`\n  Phase 2 results: ${phase2Results.length} (including equal-weight) in ${phase2Time}s`);

  // -----------------------------------------------------------------------
  // Step 5: Final scoring and ranking
  // -----------------------------------------------------------------------
  console.log("\n── Step 5: Final scoring ────────────────────────────────────\n");

  // Hard filter again (some sharpe results might have margin calls)
  const finalPool = phase2Results.filter((c) => c.marginCallCount === 0);
  console.log(`  Zero margin calls: ${finalPool.length} / ${phase2Results.length}`);

  const finalScored = scoreAndRank(finalPool.length > 0 ? finalPool : phase2Results);
  finalScored.sort((a, b) => b.compositeScore - a.compositeScore);

  // -----------------------------------------------------------------------
  // Step 6: Display results
  // -----------------------------------------------------------------------
  printResultsTable(finalScored, top);

  // Summary: most common assets in top results
  const topResults = finalScored.slice(0, top);
  const assetFrequency = new Map<string, number>();
  const modeFrequency = new Map<string, number>();
  const classFrequency = new Map<string, number>();

  for (const r of topResults) {
    for (const sym of r.symbols) {
      assetFrequency.set(sym, (assetFrequency.get(sym) || 0) + 1);
    }
    modeFrequency.set(r.weightMode, (modeFrequency.get(r.weightMode) || 0) + 1);
    for (const cls of r.assetClasses) {
      classFrequency.set(cls, (classFrequency.get(cls) || 0) + 1);
    }
  }

  console.log("\n── Summary ─────────────────────────────────────────────────\n");

  console.log("  Most common assets in top results:");
  const sortedAssets = Array.from(assetFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [sym, count] of sortedAssets) {
    const def = ASSET_UNIVERSE.find((a) => a.symbol === sym);
    const pct = ((count / topResults.length) * 100).toFixed(0);
    console.log(`    ${sym.padEnd(8)} ${String(count).padStart(3)}x (${pct}%)  ${def?.name || ""}`);
  }

  console.log("\n  Weight modes:");
  for (const [mode, count] of Array.from(modeFrequency.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${mode.padEnd(15)} ${count}x`);
  }

  console.log("\n  Asset classes:");
  for (const [cls, count] of Array.from(classFrequency.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cls.padEnd(15)} ${count}x`);
  }

  // -----------------------------------------------------------------------
  // Step 7: Write JSON output
  // -----------------------------------------------------------------------
  const dateStr = new Date().toISOString().split("T")[0];
  const outputPath = join(
    __dirname,
    `exploration-results-${profile}-${dateStr}.json`
  );

  const output = {
    metadata: {
      profile,
      riskParams: riskProfile.params,
      generatedAt: new Date().toISOString(),
      priceRange: { start: PRICE_START_DATE, end: endDate },
      assetUniverse: availableAssets.length,
      failedSymbols,
      phase1: {
        totalCombos: allCombos.length,
        successfulBacktests: phase1Results.length,
        zeroMarginCalls: noMarginCall.length,
        selectedForPhase2: phase2Candidates.length,
        timeSeconds: parseFloat(phase1Time),
      },
      phase2: {
        totalResults: phase2Results.length,
        timeSeconds: parseFloat(phase2Time),
      },
      scoring: {
        weights: {
          dispersion: 0.35,
          worstCase: 0.25,
          sharpe: 0.25,
          drawdown: 0.15,
        },
      },
    },
    topResults: topResults.map((r, i) => ({
      rank: i + 1,
      ...r,
    })),
    allScoredResults: finalScored.map((r, i) => ({
      rank: i + 1,
      ...r,
    })),
    assetFrequency: Object.fromEntries(sortedAssets),
    modeFrequency: Object.fromEntries(modeFrequency),
  };

  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n  Results saved to: ${outputPath}`);

  const totalTime = ((Date.now() - startPhase1) / 1000 / 60).toFixed(1);
  console.log(`\n  Total exploration time: ${totalTime} minutes\n`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

explore()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
