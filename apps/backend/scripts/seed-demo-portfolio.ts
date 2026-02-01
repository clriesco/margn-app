/**
 * Seed script to populate demo portfolios with historical data
 *
 * Creates TWO demo users to test different leverage scenarios:
 * - clriesco+demo1@gmail.com: Leverage HIGH scenario (needs extra contribution)
 * - clriesco+demo2@gmail.com: Leverage LOW scenario (needs reborrow)
 *
 * Implements the FULL algorithm from BacktestHistorical.ipynb:
 * 1. Download historical data for optimization period (before backtest)
 * 2. Optimize portfolio weights (maximize Sharpe ratio with constraints)
 * 3. Run backtest with optimized weights
 * 4. Optional: Dynamic rebalancing with re-optimization from month 13
 *
 * Usage: npx ts-node scripts/seed-demo-portfolio.ts
 */

import { config } from "dotenv";
import { join } from "path";

// Load environment variables from .env
config({ path: join(__dirname, "../.env") });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function getDailyMetricClient() {
  return prisma.dailyMetric ?? null;
}

// ============================================================================
// DEMO CONFIGURATIONS
// ============================================================================

interface DemoConfig {
  email: string;
  portfolioName: string;
  description: string;
  // Leverage range that will be STORED in the portfolio config
  // (different from simulation leverage)
  configLeverageMin: number;
  configLeverageMax: number;
  configLeverageTarget: number;
  // Monthly contribution config
  monthlyContribution: number;
  contributionDayOfMonth: number;
}

/**
 * Demo 1: LEVERAGE HIGH scenario
 * - Simulates with leverage ~2x
 * - But config says max leverage is 1.8x
 * - Result: Current leverage (2x) > Max (1.8x) → EXTRA CONTRIBUTION needed
 */
const DEMO1_CONFIG: DemoConfig = {
  email: "clriesco+demo1@gmail.com",
  portfolioName: "Demo Portfolio - Leverage Alto",
  description:
    "Escenario donde el leverage actual excede el máximo configurado",
  configLeverageMin: 1.2,
  configLeverageMax: 1.8,
  configLeverageTarget: 1.5,
  monthlyContribution: 1000,
  contributionDayOfMonth: 1,
};

/**
 * Demo 2: LEVERAGE LOW scenario
 * - Simulates with leverage ~2x
 * - But config says min leverage is 3x
 * - Result: Current leverage (2x) < Min (3x) → REBORROW needed
 */
const DEMO2_CONFIG: DemoConfig = {
  email: "clriesco+demo2@gmail.com",
  portfolioName: "Demo Portfolio - Leverage Bajo",
  description: "Escenario donde el leverage actual está por debajo del mínimo",
  configLeverageMin: 3.0,
  configLeverageMax: 4.5,
  configLeverageTarget: 3.5,
  monthlyContribution: 1000,
  contributionDayOfMonth: 1,
};

// ============================================================================
// METAPARAMETERS (for simulation - matching BacktestHistorical.ipynb)
// ============================================================================
const METAPARAMETERS = {
  initialCapital: 10000, // Starting Equity/Collateral in USD
  monthlyContribution: 1000, // New Equity injected every month
  leverage: 2, // Target leverage ratio for SIMULATION (will produce ~2x leverage)
  minLeverage: 1.5, // Minimum leverage to maintain during simulation
  maxLeverage: 2.5, // Maximum leverage during simulation
  maxWeight: 0.4, // Constraint: Maximum weight per asset (40%)
  minWeight: 0.05, // Constraint: Minimum weight per asset (5%)
  drawdownRedeployThreshold: 0.12, // Drawdown level (12%) for full DCA
  weightDeviationThreshold: 0.05, // Max tolerated deviation from target weights
  volatilityLookbackDays: 63, // Lookback window for volatility
  volatilityRedeployThreshold: 0.18, // Annualized volatility threshold
  gradualDeployFactor: 0.5, // Fraction of DCA to deploy gradually
  meanReturnShrinkage: 0.6, // Shrinkage applied to historical mean returns
  riskFreeRate: 0.02, // 2% risk-free rate
  dataPeriodYears: 3, // Historical period (years) for initial optimization
  useDynamicSharpeRebalance: true, // Dynamic Sharpe optimization during backtest
  yearlyTradingDays: 252,
};

// Initial portfolio weights (fallback, will be replaced by optimized weights)
const PORTFOLIO_INITIAL: Record<string, number> = {
  SPY: 0.6,
  TLT: 0.15,
  VT: 0.2,
  "BTC-USD": 0.05,
};

// Configuration
const START_DATE = new Date("2024-01-01");
const END_DATE = new Date("2025-12-01"); // Extended to December 2025

// Asset definitions
const ASSETS = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF", assetType: "index" },
  {
    symbol: "TLT",
    name: "iShares 20+ Year Treasury Bond ETF",
    assetType: "bond",
  },
  { symbol: "VT", name: "Vanguard Total World Stock ETF", assetType: "index" },
  { symbol: "BTC-USD", name: "Bitcoin USD", assetType: "crypto" },
];

// ============================================================================
// TYPES
// ============================================================================

interface YahooFinanceHistoricalResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        adjclose?: Array<{
          adjclose?: Array<number | null>;
        }>;
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
}

interface PortfolioState {
  equity: number;
  exposure: number;
  peakEquity: number;
  positions: Record<string, { quantity: number; value: number }>;
  dailyEquityHistory: number[];
  priceHistory: Record<string, number[]>;
}

interface DailySeriesEntry {
  date: string;
  equity: number;
  exposure: number;
  drawdown: number;
}

interface DeploySignals {
  deployFraction: number;
  drawdown: number;
  weightDeviation: number;
  realizedVolatility: number | null;
  drawdownTriggered: boolean;
  weightDeviationTriggered: boolean;
  volatilityTriggered: boolean;
}

// ============================================================================
// YAHOO FINANCE DATA FETCHING
// ============================================================================

/**
 * Fetch historical daily prices from Yahoo Finance for a date range
 */
async function fetchYahooHistoricalPrices(
  symbol: string,
  startDate: Date,
  endDate: Date
): Promise<{ dates: Date[]; prices: number[] }> {
  try {
    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch historical data for ${symbol}`);
      return { dates: [], prices: [] };
    }

    const data = (await response.json()) as YahooFinanceHistoricalResponse;
    const result = data.chart?.result?.[0];

    if (!result?.timestamp || !result?.indicators) {
      return { dates: [], prices: [] };
    }

    const timestamps = result.timestamp;
    const adjCloses = result.indicators.adjclose?.[0]?.adjclose;
    const closes = result.indicators.quote?.[0]?.close;
    const priceArray = adjCloses || closes;

    if (!priceArray) {
      return { dates: [], prices: [] };
    }

    const dates: Date[] = [];
    const prices: number[] = [];

    for (let i = 0; i < timestamps.length; i++) {
      const price = priceArray[i];
      if (price !== null && price !== undefined && price > 0) {
        dates.push(new Date(timestamps[i] * 1000));
        prices.push(price);
      }
    }

    return { dates, prices };
  } catch (error) {
    console.error(`Error fetching historical data for ${symbol}:`, error);
    return { dates: [], prices: [] };
  }
}

/**
 * Fetch single price for a specific date
 */
async function fetchYahooPrice(
  symbol: string,
  date: Date
): Promise<number | null> {
  const startTs = Math.floor(date.getTime() / 1000);
  const endTs = startTs + 86400 * 7;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as YahooFinanceHistoricalResponse;
    const closes = data.chart?.result?.[0]?.indicators?.quote?.[0]?.close;

    if (!closes) return null;

    for (const close of closes) {
      if (close !== null && close !== undefined) return close;
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// PORTFOLIO OPTIMIZATION (Block 4 from notebook)
// ============================================================================

/**
 * Calculate log returns from price array
 */
function calculateLogReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  return returns;
}

/**
 * Calculate portfolio metrics (annualized return and volatility)
 * Matches calculate_portfolio_metrics from notebook
 */
function calculatePortfolioMetrics(
  weights: number[],
  meanReturns: number[],
  covMatrix: number[][]
): { returnAnnual: number; volAnnual: number } {
  const { yearlyTradingDays } = METAPARAMETERS;

  // Normalize weights
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = weights.map((x) => x / sum);

  // Daily mean return: sum(w * mean_returns)
  let meanDailyReturn = 0;
  for (let i = 0; i < w.length; i++) {
    meanDailyReturn += w[i] * meanReturns[i];
  }

  // Daily variance: w' * Cov * w
  let portfolioVarianceDaily = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      portfolioVarianceDaily += w[i] * w[j] * covMatrix[i][j];
    }
  }

  // Annualize
  const returnAnnual = meanDailyReturn * yearlyTradingDays;
  const volAnnual = Math.sqrt(portfolioVarianceDaily * yearlyTradingDays);

  return { returnAnnual, volAnnual };
}

/**
 * Objective function: Negative Sharpe Ratio (to minimize)
 * Matches objective_function from notebook
 */
function objectiveFunction(
  weights: number[],
  meanReturns: number[],
  covMatrix: number[][]
): number {
  const { leverage, riskFreeRate } = METAPARAMETERS;

  // Normalize weights
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = weights.map((x) => x / sum);

  const { returnAnnual, volAnnual } = calculatePortfolioMetrics(
    w,
    meanReturns,
    covMatrix
  );

  // Apply leverage to annual metrics (THE CORE ASSUMPTION)
  const rLeveraged = returnAnnual * leverage;
  const volLeveraged = volAnnual * leverage;

  // Sharpe Ratio
  if (volLeveraged <= 0) return Infinity;
  const sharpeRatio = (rLeveraged - riskFreeRate) / volLeveraged;

  // Return negative (we minimize)
  return -sharpeRatio;
}

/**
 * SLSQP-like optimization using Nelder-Mead
 * Matches the optimization in Block 4 of notebook
 */
function optimizePortfolio(
  symbols: string[],
  meanReturns: number[],
  covMatrix: number[][]
): { weights: Record<string, number>; sharpeRatio: number } {
  const n = symbols.length;
  const { minWeight, maxWeight } = METAPARAMETERS;

  // Objective: negative Sharpe (minimize)
  const negSharpe = (weights: number[]): number => {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Infinity;

    // Check constraints
    const w = weights.map((x) => x / sum);
    for (const weight of w) {
      if (weight < minWeight - 0.001 || weight > maxWeight + 0.001) {
        return Infinity;
      }
    }

    return objectiveFunction(weights, meanReturns, covMatrix);
  };

  // Initialize with equal weights
  let bestWeights = Array(n).fill(1 / n);
  let bestValue = negSharpe(bestWeights);

  // Nelder-Mead optimization
  const alpha = 1.0,
    gamma = 2.0,
    rho = 0.5,
    sigma = 0.5;
  const tolerance = 1e-8;
  const maxIterations = 1000;

  // Initialize simplex
  const simplex: { point: number[]; value: number }[] = [];
  simplex.push({ point: [...bestWeights], value: bestValue });

  for (let i = 0; i < n; i++) {
    const point = [...bestWeights];
    point[i] = Math.min(maxWeight, point[i] + 0.05);
    const sum = point.reduce((a, b) => a + b, 0);
    for (let j = 0; j < n; j++) point[j] /= sum;
    simplex.push({ point, value: negSharpe(point) });
  }

  simplex.sort((a, b) => a.value - b.value);

  for (let iter = 0; iter < maxIterations; iter++) {
    const range = simplex[n].value - simplex[0].value;
    if (range < tolerance) break;

    // Centroid
    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i].point[j] / n;
      }
    }

    // Reflection
    const reflected = centroid.map(
      (c, j) => c + alpha * (c - simplex[n].point[j])
    );
    for (let j = 0; j < n; j++)
      reflected[j] = Math.max(0.01, Math.min(0.99, reflected[j]));
    const reflectedValue = negSharpe(reflected);

    if (reflectedValue < simplex[0].value) {
      // Expansion
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      for (let j = 0; j < n; j++)
        expanded[j] = Math.max(0.01, Math.min(0.99, expanded[j]));
      const expandedValue = negSharpe(expanded);
      simplex[n] =
        expandedValue < reflectedValue
          ? { point: expanded, value: expandedValue }
          : { point: reflected, value: reflectedValue };
    } else if (reflectedValue < simplex[n - 1].value) {
      simplex[n] = { point: reflected, value: reflectedValue };
    } else {
      // Contraction
      const contracted = centroid.map(
        (c, j) => c + rho * (simplex[n].point[j] - c)
      );
      const contractedValue = negSharpe(contracted);
      if (contractedValue < simplex[n].value) {
        simplex[n] = { point: contracted, value: contractedValue };
      } else {
        // Shrink
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i].point[j] =
              simplex[0].point[j] +
              sigma * (simplex[i].point[j] - simplex[0].point[j]);
          }
          simplex[i].value = negSharpe(simplex[i].point);
        }
      }
    }

    simplex.sort((a, b) => a.value - b.value);
  }

  bestWeights = simplex[0].point;

  // Normalize and apply constraints
  let sum = bestWeights.reduce((a, b) => a + b, 0);
  bestWeights = bestWeights.map((w) => w / sum);

  // Apply min/max constraints with redistribution
  for (let iter = 0; iter < 20; iter++) {
    let needsAdjustment = false;
    let excess = 0;

    for (let i = 0; i < n; i++) {
      if (bestWeights[i] > maxWeight) {
        excess += bestWeights[i] - maxWeight;
        bestWeights[i] = maxWeight;
        needsAdjustment = true;
      } else if (bestWeights[i] < minWeight) {
        excess -= minWeight - bestWeights[i];
        bestWeights[i] = minWeight;
        needsAdjustment = true;
      }
    }

    if (!needsAdjustment) break;

    const adjustable = bestWeights.filter(
      (w) => w > minWeight && w < maxWeight
    ).length;
    if (adjustable > 0 && excess !== 0) {
      const adjustment = excess / adjustable;
      for (let i = 0; i < n; i++) {
        if (bestWeights[i] > minWeight && bestWeights[i] < maxWeight) {
          bestWeights[i] -= adjustment;
        }
      }
    }
  }

  // Final normalization
  sum = bestWeights.reduce((a, b) => a + b, 0);
  bestWeights = bestWeights.map((w) => w / sum);

  // Round to 4 decimals like notebook
  bestWeights = bestWeights.map((w) => Math.round(w * 10000) / 10000);

  // Build result
  const result: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    result[symbols[i]] = bestWeights[i];
  }

  const sharpeRatio = -simplex[0].value;

  return { weights: result, sharpeRatio };
}

/**
 * Download historical data and optimize portfolio weights
 * This is Block 2-4 from the notebook
 */
async function downloadAndOptimizePortfolio(): Promise<{
  optimizedWeights: Record<string, number>;
  sharpeRatio: number;
  returnAnnual: number;
  volAnnual: number;
  historicalPrices: Record<string, { dates: Date[]; prices: number[] }>;
}> {
  console.log("\n" + "═".repeat(60));
  console.log("📊 BLOCK 2-4: DOWNLOAD DATA & OPTIMIZE PORTFOLIO");
  console.log("═".repeat(60));

  const symbols = Object.keys(PORTFOLIO_INITIAL);

  // Calculate date range for historical data (dataPeriodYears before START_DATE)
  const optimizationEndDate = new Date(START_DATE);
  optimizationEndDate.setDate(optimizationEndDate.getDate() - 1); // Day before backtest starts
  const optimizationStartDate = new Date(optimizationEndDate);
  optimizationStartDate.setFullYear(
    optimizationStartDate.getFullYear() - METAPARAMETERS.dataPeriodYears
  );

  console.log(`\n📥 Downloading historical data for optimization...`);
  console.log(
    `   Period: ${optimizationStartDate.toISOString().split("T")[0]} to ${
      optimizationEndDate.toISOString().split("T")[0]
    }`
  );
  console.log(`   Assets: ${symbols.join(", ")}`);

  // Download historical prices for each asset
  const historicalPrices: Record<string, { dates: Date[]; prices: number[] }> =
    {};
  const assetReturns: Record<string, number[]> = {};

  for (const symbol of symbols) {
    console.log(`   Fetching ${symbol}...`);
    const data = await fetchYahooHistoricalPrices(
      symbol,
      optimizationStartDate,
      optimizationEndDate
    );
    historicalPrices[symbol] = data;

    if (data.prices.length > 0) {
      assetReturns[symbol] = calculateLogReturns(data.prices);
      console.log(
        `      ✅ ${data.prices.length} days, ${assetReturns[symbol].length} returns`
      );
    } else {
      console.log(`      ⚠️ No data available`);
    }
  }

  // Align all returns to same length
  const availableSymbols = symbols.filter(
    (s) => (assetReturns[s]?.length || 0) > 30
  );
  const minLength = Math.min(
    ...availableSymbols.map((s) => assetReturns[s].length)
  );

  console.log(`\n📈 Calculating statistics for optimization...`);
  console.log(`   Available assets: ${availableSymbols.join(", ")}`);
  console.log(`   Common trading days: ${minLength}`);

  // Calculate mean returns WITH SHRINKAGE
  const meanReturns: number[] = [];
  for (const symbol of availableSymbols) {
    const returns = assetReturns[symbol].slice(-minLength);
    const rawMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const shrunkMean = rawMean * METAPARAMETERS.meanReturnShrinkage;
    meanReturns.push(shrunkMean);
  }

  // Calculate covariance matrix
  const covMatrix: number[][] = [];
  for (let i = 0; i < availableSymbols.length; i++) {
    covMatrix[i] = [];
    const returnsI = assetReturns[availableSymbols[i]].slice(-minLength);
    const meanI = returnsI.reduce((a, b) => a + b, 0) / returnsI.length;

    for (let j = 0; j < availableSymbols.length; j++) {
      const returnsJ = assetReturns[availableSymbols[j]].slice(-minLength);
      const meanJ = returnsJ.reduce((a, b) => a + b, 0) / returnsJ.length;

      let cov = 0;
      for (let k = 0; k < minLength; k++) {
        cov += (returnsI[k] - meanI) * (returnsJ[k] - meanJ);
      }
      covMatrix[i][j] = cov / (minLength - 1);
    }
  }

  // Optimize portfolio
  console.log("\n🎯 Running portfolio optimization (maximize Sharpe ratio)...");
  console.log(
    `   Constraints: min=${METAPARAMETERS.minWeight * 100}%, max=${
      METAPARAMETERS.maxWeight * 100
    }%`
  );
  console.log(`   Leverage: ${METAPARAMETERS.leverage}x`);
  console.log(
    `   Mean return shrinkage: ${METAPARAMETERS.meanReturnShrinkage}`
  );

  const { weights: optimizedWeights, sharpeRatio } = optimizePortfolio(
    availableSymbols,
    meanReturns,
    covMatrix
  );

  // Fill in any missing symbols with 0
  for (const symbol of symbols) {
    if (!(symbol in optimizedWeights)) {
      optimizedWeights[symbol] = 0;
    }
  }

  // Calculate performance metrics for optimized portfolio
  const optWeightsArray = availableSymbols.map((s) => optimizedWeights[s]);
  const { returnAnnual, volAnnual } = calculatePortfolioMetrics(
    optWeightsArray,
    meanReturns,
    covMatrix
  );

  console.log("\n✅ Optimization complete!");
  console.log("\n📊 OPTIMIZED PORTFOLIO WEIGHTS (PORTFOLIO_OPTIMIZED):");
  console.log("─".repeat(40));
  for (const [symbol, weight] of Object.entries(optimizedWeights)) {
    if (weight > 0) {
      console.log(`   ${symbol}: ${(weight * 100).toFixed(2)}%`);
    }
  }
  console.log("─".repeat(40));
  console.log(`\n📈 Performance (without leverage):`);
  console.log(`   Annualized Return: ${(returnAnnual * 100).toFixed(2)}%`);
  console.log(`   Annualized Volatility: ${(volAnnual * 100).toFixed(2)}%`);
  console.log(`   Sharpe Ratio (leveraged): ${sharpeRatio.toFixed(2)}`);

  return {
    optimizedWeights,
    sharpeRatio,
    returnAnnual,
    volAnnual,
    historicalPrices,
  };
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

async function downloadSimulationDailyPrices(): Promise<
  Record<string, { dates: Date[]; prices: number[] }>
> {
  console.log(
    "\n📥 Downloading daily price history for the simulation window..."
  );
  const result: Record<string, { dates: Date[]; prices: number[] }> = {};

  for (const asset of ASSETS) {
    console.log(
      `   ${asset.symbol} → ${START_DATE.toISOString().split("T")[0]} - ${
        END_DATE.toISOString().split("T")[0]
      }`
    );
    result[asset.symbol] = await fetchYahooHistoricalPrices(
      asset.symbol,
      START_DATE,
      END_DATE
    );
    console.log(`      ${result[asset.symbol].prices.length} trading days`);
  }

  return result;
}

function getPriceOnOrBefore(
  symbol: string,
  date: Date,
  data: Record<string, { dates: Date[]; prices: number[] }>
): number | null {
  const history = data[symbol];
  if (!history) return null;
  for (let i = history.dates.length - 1; i >= 0; i--) {
    if (history.dates[i].getTime() <= date.getTime()) {
      return history.prices[i];
    }
  }
  return null;
}

async function persistDailyPrices(
  assetMap: Record<string, string>,
  dailyPrices: Record<string, { dates: Date[]; prices: number[] }>
) {
  console.log("\n💾 Persisting daily prices...");
  for (const [symbol, data] of Object.entries(dailyPrices)) {
    const assetId = assetMap[symbol];
    if (!assetId) continue;
    console.log(
      `   ${symbol}: ${data.prices.length} rows (${
        data.dates[0]?.toISOString().split("T")[0]
      } - ${data.dates.at(-1)?.toISOString().split("T")[0]})`
    );
    for (let i = 0; i < data.dates.length; i++) {
      const date = data.dates[i];
      const close = data.prices[i];
      await prisma.assetPrice.upsert({
        where: { assetId_date: { assetId, date } },
        create: {
          assetId,
          date,
          close,
        },
        update: {
          close,
        },
      });
    }
  }
}

async function persistDailyMetrics(
  portfolioId: string,
  dailySeries: DailySeriesEntry[]
) {
  if (!dailySeries || dailySeries.length === 0) {
    return;
  }

  const data = dailySeries.map((entry) => ({
    portfolioId,
    date: new Date(entry.date),
    equity: entry.equity,
    exposure: entry.exposure,
    leverage: entry.equity > 0 ? entry.exposure / entry.equity : 0,
    drawdown: entry.drawdown,
  }));

  const dailyMetricClient = getDailyMetricClient();
  if (!dailyMetricClient) {
    console.warn(
      "[Seed] dailyMetric client not generated yet; skipping daily persistence."
    );
    return;
  }

  await dailyMetricClient.createMany({
    data,
    skipDuplicates: true,
  });
}

function simulateDailyEquitySeries(
  state: PortfolioState,
  positions: Record<string, { quantity: number; value: number }>,
  borrow: number,
  dailyPrices: Record<string, { dates: Date[]; prices: number[] }>,
  startDate: Date,
  endDate: Date,
  fallbackExposure: number,
  fallbackEquity: number
): {
  lastExposure: number;
  lastEquity: number;
  dailySeries: DailySeriesEntry[];
} {
  const startKey = formatDateKey(startDate);
  const endKey = formatDateKey(endDate);
  const uniqueDates = new Set<string>();
  uniqueDates.add(startKey);
  uniqueDates.add(endKey);
  const dailySeries: DailySeriesEntry[] = [];

  for (const symbol of Object.keys(positions)) {
    const history = dailyPrices[symbol];
    if (!history) continue;
    for (const date of history.dates) {
      const key = formatDateKey(date);
      if (key >= startKey && key <= endKey) {
        uniqueDates.add(key);
      }
    }
  }

  if (uniqueDates.size === 0) {
    state.dailyEquityHistory.push(fallbackEquity);
    state.peakEquity = Math.max(state.peakEquity, fallbackEquity);
    dailySeries.push({
      date: startKey,
      equity: fallbackEquity,
      exposure: fallbackExposure,
      drawdown: 0,
    });
    return {
      lastExposure: fallbackExposure,
      lastEquity: fallbackEquity,
      dailySeries,
    };
  }

  const sortedDates = Array.from(uniqueDates).sort(
    (a, b) => new Date(a).getTime() - new Date(b).getTime()
  );

  const dataIndices: Record<string, number> = {};
  const lastPrices: Record<string, number | null> = {};
  for (const symbol of Object.keys(positions)) {
    dataIndices[symbol] = 0;
    lastPrices[symbol] = null;
    const history = dailyPrices[symbol];
    if (!history) continue;
    while (
      dataIndices[symbol] < history.dates.length &&
      history.dates[dataIndices[symbol]].getTime() <= startDate.getTime()
    ) {
      lastPrices[symbol] = history.prices[dataIndices[symbol]];
      dataIndices[symbol]++;
    }
  }

  let lastExposure = fallbackExposure;
  let lastEquity = fallbackEquity;
  let pushed = false;

  for (const isoDate of sortedDates) {
    const currentDate = new Date(isoDate);
    for (const symbol of Object.keys(positions)) {
      const history = dailyPrices[symbol];
      if (!history) continue;
      while (
        dataIndices[symbol] < history.dates.length &&
        history.dates[dataIndices[symbol]].getTime() <= currentDate.getTime()
      ) {
        lastPrices[symbol] = history.prices[dataIndices[symbol]];
        dataIndices[symbol]++;
      }
    }

    let dayExposure = 0;
    let hasPrice = false;

    for (const [symbol, position] of Object.entries(positions)) {
      const price = lastPrices[symbol];
      if (price && price > 0) {
        dayExposure += position.quantity * price;
        hasPrice = true;
      }
    }

    if (!hasPrice) continue;

    const dayEquity = dayExposure - borrow;
    const prevPeak = state.peakEquity;
    const drawdown = prevPeak > 0 ? dayEquity / prevPeak - 1 : 0;

    state.dailyEquityHistory.push(dayEquity);
    state.peakEquity = Math.max(state.peakEquity, dayEquity);
    lastExposure = dayExposure;
    lastEquity = dayEquity;
    pushed = true;
    dailySeries.push({
      date: isoDate,
      equity: dayEquity,
      exposure: dayExposure,
      drawdown,
    });
  }

  if (!pushed) {
    state.dailyEquityHistory.push(fallbackEquity);
    state.peakEquity = Math.max(state.peakEquity, fallbackEquity);
    dailySeries.push({
      date: formatDateKey(startDate),
      equity: fallbackEquity,
      exposure: fallbackExposure,
      drawdown: 0,
    });
  }

  return { lastExposure, lastEquity, dailySeries };
}

// ============================================================================
// DEPLOY SIGNALS CALCULATION
// ============================================================================

function calculateDeploySignals(
  state: PortfolioState,
  currentWeights: Record<string, number>
): DeploySignals {
  const { equity, peakEquity, positions, exposure, dailyEquityHistory } = state;

  // 1. Calculate drawdown
  const drawdown = peakEquity > 0 ? equity / peakEquity - 1 : 0;

  // 2. Calculate weight deviation from target
  let weightDeviation = 0;
  if (exposure > 0) {
    for (const [symbol, pos] of Object.entries(positions)) {
      const currentWeight = pos.value / exposure;
      const targetWeight = currentWeights[symbol] || 0;
      const deviation = Math.abs(currentWeight - targetWeight);
      if (deviation > weightDeviation) {
        weightDeviation = deviation;
      }
    }
  }

  // 3. Calculate realized volatility
  let realizedVolatility: number | null = null;
  if (dailyEquityHistory.length >= 2) {
    const lookback = Math.min(
      METAPARAMETERS.volatilityLookbackDays + 1,
      dailyEquityHistory.length
    );
    const equityWindow = dailyEquityHistory.slice(-lookback);

    if (equityWindow.length > 1) {
      const logReturns: number[] = [];
      for (let i = 1; i < equityWindow.length; i++) {
        if (equityWindow[i - 1] > 0) {
          logReturns.push(Math.log(equityWindow[i] / equityWindow[i - 1]));
        }
      }

      if (logReturns.length > 0) {
        const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance =
          logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
          (logReturns.length - 1 || 1);
        realizedVolatility =
          Math.sqrt(variance) * Math.sqrt(METAPARAMETERS.yearlyTradingDays);
      }
    }
  }

  // 4. Determine deploy fraction
  let deployFraction = 0;
  let drawdownTriggered = false;
  let weightDeviationTriggered = false;
  let volatilityTriggered = false;

  if (drawdown <= -METAPARAMETERS.drawdownRedeployThreshold) {
    deployFraction = 1.0;
    drawdownTriggered = true;
  } else {
    if (weightDeviation >= METAPARAMETERS.weightDeviationThreshold) {
      deployFraction = 1.0;
      weightDeviationTriggered = true;
    }
    if (
      realizedVolatility !== null &&
      realizedVolatility <= METAPARAMETERS.volatilityRedeployThreshold
    ) {
      deployFraction = 1.0;
      volatilityTriggered = true;
    }
  }

  if (deployFraction > 0) {
    deployFraction = Math.min(
      deployFraction,
      METAPARAMETERS.gradualDeployFactor
    );
  }

  return {
    deployFraction,
    drawdown,
    weightDeviation,
    realizedVolatility,
    drawdownTriggered,
    weightDeviationTriggered,
    volatilityTriggered,
  };
}

// ============================================================================
// DYNAMIC REBALANCING (compute_optimal_sharpe_weights from notebook)
// ============================================================================

function computeDynamicWeights(
  priceHistory: Record<string, number[]>,
  monthNumber: number
): { weights: Record<string, number>; isDynamic: boolean } | null {
  if (!METAPARAMETERS.useDynamicSharpeRebalance) {
    return null;
  }

  // Need at least 6 months of data for meaningful re-optimization
  if (monthNumber < 6) {
    return null;
  }

  const symbols = Object.keys(priceHistory).filter(
    (s) => priceHistory[s].length >= 30
  );
  if (symbols.length < 2) return null;

  // Calculate log returns
  const assetReturns: Record<string, number[]> = {};
  for (const symbol of symbols) {
    assetReturns[symbol] = calculateLogReturns(priceHistory[symbol]);
  }

  const minLength = Math.min(...symbols.map((s) => assetReturns[s].length));
  if (minLength < 20) return null;

  // Calculate mean returns WITH SHRINKAGE
  const meanReturns: number[] = [];
  for (const symbol of symbols) {
    const returns = assetReturns[symbol].slice(-minLength);
    const rawMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    meanReturns.push(rawMean * METAPARAMETERS.meanReturnShrinkage);
  }

  // Calculate covariance matrix
  const covMatrix: number[][] = [];
  for (let i = 0; i < symbols.length; i++) {
    covMatrix[i] = [];
    const returnsI = assetReturns[symbols[i]].slice(-minLength);
    const meanI = returnsI.reduce((a, b) => a + b, 0) / returnsI.length;

    for (let j = 0; j < symbols.length; j++) {
      const returnsJ = assetReturns[symbols[j]].slice(-minLength);
      const meanJ = returnsJ.reduce((a, b) => a + b, 0) / returnsJ.length;

      let cov = 0;
      for (let k = 0; k < minLength; k++) {
        cov += (returnsI[k] - meanI) * (returnsJ[k] - meanJ);
      }
      covMatrix[i][j] = cov / (minLength - 1);
    }
  }

  const { weights } = optimizePortfolio(symbols, meanReturns, covMatrix);

  // Fill missing
  for (const symbol of Object.keys(PORTFOLIO_INITIAL)) {
    if (!(symbol in weights)) {
      weights[symbol] = 0;
    }
  }

  return { weights, isDynamic: true };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getMonthlyDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }
  return dates;
}

function calculateTargetExposure(
  newEquity: number,
  currentExposure: number,
  pendingContribution: number,
  deployFraction: number
): number {
  const { leverage, minLeverage } = METAPARAMETERS;
  const desiredExposure = newEquity * leverage;
  const minExposure = newEquity * minLeverage;

  const previousEquity = Math.max(newEquity - pendingContribution, 0);
  const previousMinExposure = previousEquity * minLeverage;

  const holdingContributions =
    pendingContribution > 0 &&
    deployFraction === 0 &&
    currentExposure >= previousMinExposure;

  let targetExposure = currentExposure;

  if (!holdingContributions && targetExposure < minExposure) {
    targetExposure = minExposure;
  }

  if (deployFraction > 0 && pendingContribution > 0) {
    const maxIncrease = pendingContribution * leverage * deployFraction;
    const proposedExposure = currentExposure + maxIncrease;
    targetExposure = Math.max(
      targetExposure,
      Math.min(desiredExposure, proposedExposure)
    );
  }

  return Math.min(targetExposure, desiredExposure);
}

function calculatePositions(
  targetExposure: number,
  weights: Record<string, number>,
  prices: Record<string, number>
): Record<string, { quantity: number; value: number }> {
  const positions: Record<string, { quantity: number; value: number }> = {};
  for (const [symbol, weight] of Object.entries(weights)) {
    const targetValue = targetExposure * weight;
    const price = prices[symbol];
    if (price && price > 0) {
      positions[symbol] = { quantity: targetValue / price, value: targetValue };
    }
  }
  return positions;
}

// ============================================================================
// MAIN SEED FUNCTION
// ============================================================================

/**
 * Seed a single demo portfolio with given configuration
 */
async function seedSinglePortfolio(
  demoConfig: DemoConfig,
  optimizedWeights: Record<string, number>,
  historicalPrices: Record<string, { dates: Date[]; prices: number[] }>,
  simulationDailyPrices: Record<string, { dates: Date[]; prices: number[] }>,
  assetMap: Record<string, string>
) {
  console.log("\n" + "═".repeat(70));
  console.log(`🎯 SEEDING: ${demoConfig.portfolioName}`);
  console.log(`   ${demoConfig.description}`);
  console.log("═".repeat(70));

  // Use optimized weights for the backtest
  let PORTFOLIO_OPTIMIZED = { ...optimizedWeights };

  // Create or get user
  console.log(`\n📧 Creating user: ${demoConfig.email}`);
  let user = await prisma.user.findUnique({
    where: { email: demoConfig.email },
  });

  if (!user) {
    user = await prisma.user.create({ data: { email: demoConfig.email } });
    console.log(`   ✅ User created: ${user.id}`);
  } else {
    console.log(`   ℹ️  User already exists: ${user.id}`);

    // Clean up existing data
    console.log("   🧹 Cleaning up existing portfolio data...");
    const existingPortfolios = await prisma.portfolio.findMany({
      where: { userId: user.id },
    });
    for (const existingPortfolio of existingPortfolios) {
      await prisma.metricsTimeseries.deleteMany({
        where: { portfolioId: existingPortfolio.id },
      });
      await prisma.rebalancePosition.deleteMany({
        where: { rebalanceEvent: { portfolioId: existingPortfolio.id } },
      });
      await prisma.rebalanceEvent.deleteMany({
        where: { portfolioId: existingPortfolio.id },
      });
      await prisma.portfolioPosition.deleteMany({
        where: { portfolioId: existingPortfolio.id },
      });
      await prisma.monthlyContribution.deleteMany({
        where: { portfolioId: existingPortfolio.id },
      });
      const dailyMetricClient = getDailyMetricClient();
      if (dailyMetricClient) {
        await dailyMetricClient.deleteMany({
          where: { portfolioId: existingPortfolio.id },
        });
      }
      await prisma.portfolio.delete({ where: { id: existingPortfolio.id } });
    }
  }

  // Build target weights JSON
  const targetWeightsJson = JSON.stringify(optimizedWeights);

  // Create portfolio with CONFIGURED leverage range (different from simulation!)
  console.log("\n💼 Creating portfolio with configuration...");
  console.log(
    `   Configured Leverage Range: ${demoConfig.configLeverageMin}x - ${demoConfig.configLeverageMax}x`
  );
  console.log(
    `   Configured Leverage Target: ${demoConfig.configLeverageTarget}x`
  );
  console.log(`   (Simulation will use ~${METAPARAMETERS.leverage}x leverage)`);

  // Create base portfolio first
  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      name: demoConfig.portfolioName,
      // IMPORTANT: Use CONFIG values, not simulation values!
      leverageMin: demoConfig.configLeverageMin,
      leverageMax: demoConfig.configLeverageMax,
      initialCapital: METAPARAMETERS.initialCapital,
    },
  });

  // Update with additional config fields (some may not exist in old Prisma client)
  // This uses raw SQL to be safe with schema differences
  try {
    await prisma.$executeRaw`
      UPDATE portfolios SET
        leverage_target = ${demoConfig.configLeverageTarget},
        monthly_contribution = ${demoConfig.monthlyContribution},
        contribution_day_of_month = ${demoConfig.contributionDayOfMonth},
        contribution_enabled = true,
        target_weights_json = ${targetWeightsJson},
        drawdown_redeploy_threshold = ${METAPARAMETERS.drawdownRedeployThreshold},
        weight_deviation_threshold = ${METAPARAMETERS.weightDeviationThreshold},
        volatility_lookback_days = ${METAPARAMETERS.volatilityLookbackDays},
        volatility_redeploy_threshold = ${METAPARAMETERS.volatilityRedeployThreshold},
        gradual_deploy_factor = ${METAPARAMETERS.gradualDeployFactor},
        use_dynamic_sharpe_rebalance = ${METAPARAMETERS.useDynamicSharpeRebalance},
        mean_return_shrinkage = ${METAPARAMETERS.meanReturnShrinkage},
        risk_free_rate = ${METAPARAMETERS.riskFreeRate}
      WHERE id = ${portfolio.id}
    `;
    console.log(`   ✅ Portfolio configuration updated via raw SQL`);
  } catch (err) {
    console.log(`   ⚠️  Some config fields may not exist yet: ${err}`);
  }
  const dailyMetricClient = getDailyMetricClient();
  if (dailyMetricClient) {
    await dailyMetricClient.deleteMany({
      where: { portfolioId: portfolio.id },
    });
  }
  console.log(`   ✅ Portfolio created: ${portfolio.id}`);

  // ========================================================================
  // STEP 3: Run backtest (Block 5 from notebook)
  // ========================================================================
  console.log("\n" + "═".repeat(60));
  console.log("🏃 RUNNING BACKTEST");
  console.log("═".repeat(60));

  const monthlyDates = getMonthlyDates(START_DATE, END_DATE);
  console.log(`\n📅 Processing ${monthlyDates.length} months...`);

  // Initialize state
  const state: PortfolioState = {
    equity: METAPARAMETERS.initialCapital,
    exposure: 0,
    peakEquity: METAPARAMETERS.initialCapital,
    positions: {},
    dailyEquityHistory: [],
    priceHistory: {},
  };

  // Initialize price history with historical data
  for (const [symbol, data] of Object.entries(historicalPrices)) {
    state.priceHistory[symbol] = [...data.prices];
  }

  // Process each month
  for (let monthIdx = 0; monthIdx < monthlyDates.length; monthIdx++) {
    const date = monthlyDates[monthIdx];
    const isFirstMonth = monthIdx === 0;
    const monthNumber = monthIdx + 1;
    const dateStr = date.toISOString().split("T")[0];

    console.log(`\n${"═".repeat(60)}`);
    console.log(`📆 MONTH ${monthNumber}: ${dateStr}`);
    console.log("═".repeat(60));

    // Fetch prices
    console.log("\n📈 Fetching prices...");
    const prices: Record<string, number> = {};
    let allPricesFetched = true;

    for (const symbol of Object.keys(PORTFOLIO_OPTIMIZED)) {
      const price =
        getPriceOnOrBefore(symbol, date, simulationDailyPrices) ??
        (await fetchYahooPrice(symbol, date));
      if (price) {
        prices[symbol] = price;
        state.priceHistory[symbol].push(price);
        console.log(`   ${symbol}: $${price.toFixed(2)}`);

        await prisma.assetPrice.upsert({
          where: { assetId_date: { assetId: assetMap[symbol], date } },
          create: { assetId: assetMap[symbol], date, close: price },
          update: { close: price },
        });
      } else {
        allPricesFetched = false;
        console.log(`   ${symbol}: ⚠️ Price not available`);
      }
    }

    if (!allPricesFetched) {
      console.log("\n⏭️  Skipping month due to missing prices");
      continue;
    }

    // Calculate current exposure and P&L
    let currentExposure = 0;
    for (const [symbol, pos] of Object.entries(state.positions)) {
      currentExposure += pos.quantity * prices[symbol];
    }

    const contribution = isFirstMonth
      ? METAPARAMETERS.initialCapital
      : METAPARAMETERS.monthlyContribution;
    const previousEquity = state.equity;
    let pnlForPeriod = 0;

    if (isFirstMonth) {
      state.equity = METAPARAMETERS.initialCapital;
      console.log(`\n💰 Initial capital: $${contribution.toLocaleString()}`);
    } else {
      const pnl = currentExposure - state.exposure;
      pnlForPeriod = pnl;
      state.equity = previousEquity + pnl + contribution;

      const pnlPercent = previousEquity > 0 ? (pnl / previousEquity) * 100 : 0;
      console.log(
        `\n${pnl >= 0 ? "📈" : "📉"} P&L: $${pnl.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })} (${pnlPercent >= 0 ? "+" : ""}${pnlPercent.toFixed(2)}%)`
      );
      console.log(`💰 Contribution: +$${contribution.toLocaleString()}`);
      console.log(
        `💵 New equity: $${state.equity.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}`
      );
    }

    // Save contribution
    await prisma.monthlyContribution.create({
      data: {
        portfolioId: portfolio.id,
        amount: contribution,
        contributedAt: date,
        note: isFirstMonth
          ? `Initial capital - ${dateStr}`
          : `Monthly DCA - ${dateStr}`,
      },
    });

    // Check for dynamic weight re-optimization
    const dynamicResult = computeDynamicWeights(
      state.priceHistory,
      monthNumber
    );
    let currentWeights: Record<string, number>;
    let weightsSource: string;

    if (dynamicResult) {
      currentWeights = dynamicResult.weights;
      weightsSource = "🧠 Dynamic (re-optimized)";
      PORTFOLIO_OPTIMIZED = { ...currentWeights }; // Update for future months
    } else {
      currentWeights = PORTFOLIO_OPTIMIZED;
      weightsSource = "📌 Optimized (initial)";
    }

    console.log(`\n${weightsSource}:`);
    for (const [symbol, weight] of Object.entries(currentWeights)) {
      if (weight > 0) {
        console.log(`   ${symbol}: ${(weight * 100).toFixed(2)}%`);
      }
    }

    // Calculate deploy signals
    state.exposure = currentExposure;
    const signals = calculateDeploySignals(state, currentWeights);

    console.log("\n📊 Deploy Signals:");
    console.log(`   Drawdown: ${(signals.drawdown * 100).toFixed(2)}%`);
    console.log(
      `   Weight Deviation: ${(signals.weightDeviation * 100).toFixed(2)}%`
    );
    console.log(
      `   Realized Volatility: ${
        signals.realizedVolatility !== null
          ? (signals.realizedVolatility * 100).toFixed(2) + "%"
          : "N/A"
      }`
    );
    console.log(
      `   Deploy Fraction: ${(signals.deployFraction * 100).toFixed(0)}%`
    );

    if (signals.drawdownTriggered) console.log("   🔴 Drawdown TRIGGERED");
    if (signals.weightDeviationTriggered)
      console.log("   🟡 Weight deviation TRIGGERED");
    if (signals.volatilityTriggered)
      console.log("   🟢 Low volatility TRIGGERED");

    // Calculate target exposure
    const targetExposure = calculateTargetExposure(
      state.equity,
      state.exposure,
      isFirstMonth ? state.equity : contribution,
      isFirstMonth ? 1.0 : signals.deployFraction
    );

    // Calculate new positions
    const newPositions = calculatePositions(
      targetExposure,
      currentWeights,
      prices
    );

    // Create rebalance event
    const rebalanceEvent = await prisma.rebalanceEvent.create({
      data: {
        portfolioId: portfolio.id,
        triggeredBy: isFirstMonth ? "initial" : "monthly",
        targetLeverage: METAPARAMETERS.leverage,
      },
    });

    // Save positions
    console.log(
      `\n📊 Allocation (Equity: $${state.equity.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}, Exposure: $${targetExposure.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })})`
    );

    for (const [symbol, pos] of Object.entries(newPositions)) {
      const oldQty = state.positions[symbol]?.quantity || 0;
      const delta = pos.quantity - oldQty;

      await prisma.rebalancePosition.create({
        data: {
          rebalanceEventId: rebalanceEvent.id,
          assetId: assetMap[symbol],
          targetWeight: currentWeights[symbol],
          targetUsd: pos.value,
          deltaQuantity: delta,
        },
      });

      await prisma.portfolioPosition.upsert({
        where: {
          portfolioId_assetId: {
            portfolioId: portfolio.id,
            assetId: assetMap[symbol],
          },
        },
        create: {
          portfolioId: portfolio.id,
          assetId: assetMap[symbol],
          quantity: pos.quantity,
          avgPrice: prices[symbol],
          exposureUsd: pos.value,
        },
        update: {
          quantity: pos.quantity,
          avgPrice: prices[symbol],
          exposureUsd: pos.value,
        },
      });

      const action = delta > 0.0001 ? "BUY" : delta < -0.0001 ? "SELL" : "HOLD";
      const emoji = delta > 0.0001 ? "🟢" : delta < -0.0001 ? "🔴" : "⚪";
      console.log(
        `   ${emoji} ${symbol}: ${pos.quantity.toFixed(
          4
        )} ($${pos.value.toLocaleString(undefined, {
          maximumFractionDigits: 0,
        })}) [${action} ${Math.abs(delta).toFixed(4)}]`
      );
    }

    const composition = Object.entries(currentWeights)
      .filter(([, weight]) => weight > 0)
      .map(([symbol, weight]) => ({
        symbol,
        weight,
        value: newPositions[symbol]?.value || 0,
        quantity: newPositions[symbol]?.quantity || 0,
      }));

    const metadata: Record<string, any> = {
      pnl: isFirstMonth ? 0 : pnlForPeriod,
      pnlPercent:
        previousEquity > 0 && !isFirstMonth
          ? (pnlForPeriod / previousEquity) * 100
          : 0,
      contribution,
      deployFraction: signals.deployFraction,
      drawdown: signals.drawdown,
      weightDeviation: signals.weightDeviation,
      realizedVolatility: signals.realizedVolatility,
      weightsUsed: currentWeights,
      dynamicWeights: dynamicResult !== null,
      composition,
    };

    const equityAfterRebalance = state.equity;
    const borrow = targetExposure - equityAfterRebalance;
    let periodEnd: Date;
    if (monthIdx < monthlyDates.length - 1) {
      periodEnd = new Date(monthlyDates[monthIdx + 1]);
      periodEnd.setDate(periodEnd.getDate() - 1);
    } else {
      periodEnd = new Date(date);
    }
    if (periodEnd < date) {
      periodEnd = new Date(date);
    }

    const { lastExposure, lastEquity, dailySeries } = simulateDailyEquitySeries(
      state,
      newPositions,
      borrow,
      simulationDailyPrices,
      date,
      periodEnd,
      targetExposure,
      equityAfterRebalance
    );

    metadata.dailySeries = dailySeries;

    await persistDailyMetrics(portfolio.id, dailySeries);

    // Save metrics
    await prisma.metricsTimeseries.create({
      data: {
        portfolioId: portfolio.id,
        date,
        equity: state.equity,
        exposure: targetExposure,
        leverage: targetExposure / state.equity,
        drawdown: signals.drawdown,
        metadataJson: JSON.stringify(metadata),
      },
    });

    state.positions = newPositions;
    state.exposure = lastExposure;
    state.equity = lastEquity;
  }

  // ========================================================================
  // SUMMARY FOR THIS PORTFOLIO
  // ========================================================================
  console.log("\n" + "─".repeat(60));
  console.log(`✅ PORTFOLIO SEED COMPLETED: ${demoConfig.portfolioName}`);
  console.log("─".repeat(60));

  const totalContributions = await prisma.monthlyContribution.aggregate({
    where: { portfolioId: portfolio.id },
    _sum: { amount: true },
  });

  const finalMetrics = await prisma.metricsTimeseries.findFirst({
    where: { portfolioId: portfolio.id },
    orderBy: { date: "desc" },
  });

  const rebalanceCount = await prisma.rebalanceEvent.count({
    where: { portfolioId: portfolio.id },
  });

  const totalReturn =
    finalMetrics && totalContributions._sum.amount
      ? ((finalMetrics.equity - totalContributions._sum.amount) /
          totalContributions._sum.amount) *
        100
      : 0;

  // Calculate actual leverage from simulation
  const actualLeverage = finalMetrics ? finalMetrics.leverage : 0;

  console.log(`\n📊 Final Summary:`);
  console.log(`   User: ${demoConfig.email}`);
  console.log(`   Portfolio: ${portfolio.name}`);
  console.log(
    `   Total contributions: $${totalContributions._sum.amount?.toLocaleString()}`
  );
  console.log(
    `   Final equity: $${finalMetrics?.equity.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`
  );
  console.log(
    `   Final exposure: $${finalMetrics?.exposure.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })}`
  );
  console.log(`   Simulated leverage: ${actualLeverage.toFixed(2)}x`);
  console.log(
    `   Total return: ${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(2)}%`
  );
  console.log(`   Rebalance events: ${rebalanceCount}`);

  // Show recommendation expectation
  console.log(`\n🎯 Expected Recommendation:`);
  console.log(
    `   Configured range: ${demoConfig.configLeverageMin}x - ${demoConfig.configLeverageMax}x`
  );
  console.log(`   Actual leverage: ${actualLeverage.toFixed(2)}x`);

  if (actualLeverage > demoConfig.configLeverageMax) {
    console.log(`   ⚠️  LEVERAGE HIGH → Should recommend EXTRA CONTRIBUTION`);
  } else if (actualLeverage < demoConfig.configLeverageMin) {
    console.log(`   📉 LEVERAGE LOW → Should recommend REBORROW`);
  } else {
    console.log(`   ✅ IN RANGE → No action required`);
  }

  return {
    portfolioId: portfolio.id,
    email: demoConfig.email,
    actualLeverage,
    configMin: demoConfig.configLeverageMin,
    configMax: demoConfig.configLeverageMax,
  };
}

/**
 * Main function - seeds both demo portfolios
 */
async function seedAllDemoPortfolios() {
  console.log("🌱 Starting DUAL demo portfolio seed...\n");
  console.log("═".repeat(70));
  console.log(
    "This will create TWO demo portfolios to test different scenarios:"
  );
  console.log("═".repeat(70));
  console.log("\n📊 Demo 1: LEVERAGE HIGH scenario");
  console.log(`   Email: ${DEMO1_CONFIG.email}`);
  console.log(
    `   Config range: ${DEMO1_CONFIG.configLeverageMin}x - ${DEMO1_CONFIG.configLeverageMax}x`
  );
  console.log(
    `   Expected: Leverage ~2x > Max ${DEMO1_CONFIG.configLeverageMax}x → EXTRA CONTRIBUTION`
  );

  console.log("\n📊 Demo 2: LEVERAGE LOW scenario");
  console.log(`   Email: ${DEMO2_CONFIG.email}`);
  console.log(
    `   Config range: ${DEMO2_CONFIG.configLeverageMin}x - ${DEMO2_CONFIG.configLeverageMax}x`
  );
  console.log(
    `   Expected: Leverage ~2x < Min ${DEMO2_CONFIG.configLeverageMin}x → REBORROW`
  );

  console.log("\n📋 Simulation Metaparameters:");
  console.log(
    `   Initial Capital: $${METAPARAMETERS.initialCapital.toLocaleString()}`
  );
  console.log(
    `   Monthly Contribution: $${METAPARAMETERS.monthlyContribution.toLocaleString()}`
  );
  console.log(`   Simulation Leverage: ${METAPARAMETERS.leverage}x`);

  try {
    // ========================================================================
    // STEP 1: Download historical data and optimize portfolio (Block 2-4)
    // ========================================================================
    const { optimizedWeights, historicalPrices } =
      await downloadAndOptimizePortfolio();
    const simulationDailyPrices = await downloadSimulationDailyPrices();

    // ========================================================================
    // STEP 2: Create assets (shared between portfolios)
    // ========================================================================
    console.log("\n" + "═".repeat(60));
    console.log("💾 CREATING SHARED ASSETS");
    console.log("═".repeat(60));

    const assetMap: Record<string, string> = {};
    for (const asset of ASSETS) {
      const existing = await prisma.asset.findUnique({
        where: { symbol: asset.symbol },
      });
      if (existing) {
        assetMap[asset.symbol] = existing.id;
        console.log(`   ℹ️  Asset ${asset.symbol} exists`);
      } else {
        const created = await prisma.asset.create({ data: asset });
        assetMap[asset.symbol] = created.id;
        console.log(`   ✅ Asset ${asset.symbol} created`);
      }
    }

    await persistDailyPrices(assetMap, simulationDailyPrices);

    // ========================================================================
    // STEP 3: Seed Demo 1 (Leverage High)
    // ========================================================================
    const result1 = await seedSinglePortfolio(
      DEMO1_CONFIG,
      optimizedWeights,
      historicalPrices,
      simulationDailyPrices,
      assetMap
    );

    // ========================================================================
    // STEP 4: Seed Demo 2 (Leverage Low)
    // ========================================================================
    const result2 = await seedSinglePortfolio(
      DEMO2_CONFIG,
      optimizedWeights,
      historicalPrices,
      simulationDailyPrices,
      assetMap
    );

    // ========================================================================
    // FINAL SUMMARY
    // ========================================================================
    console.log("\n" + "═".repeat(70));
    console.log("🎉 ALL DEMO PORTFOLIOS SEEDED SUCCESSFULLY!");
    console.log("═".repeat(70));

    console.log("\n📊 Demo Portfolio Summary:");
    console.log(
      "┌────────────────────────────────────────────────────────────────┐"
    );
    console.log(`│ Demo 1: ${DEMO1_CONFIG.email.padEnd(45)} │`);
    console.log(
      `│   Actual leverage: ${result1.actualLeverage.toFixed(
        2
      )}x │ Config max: ${result1.configMax}x │`
    );
    console.log(
      `│   Status: ${
        result1.actualLeverage > result1.configMax
          ? "⚠️  LEVERAGE HIGH → Extra contribution needed"
          : "✅ OK"
      }`.padEnd(65) + "│"
    );
    console.log(
      "├────────────────────────────────────────────────────────────────┤"
    );
    console.log(`│ Demo 2: ${DEMO2_CONFIG.email.padEnd(45)} │`);
    console.log(
      `│   Actual leverage: ${result2.actualLeverage.toFixed(
        2
      )}x │ Config min: ${result2.configMin}x │`
    );
    console.log(
      `│   Status: ${
        result2.actualLeverage < result2.configMin
          ? "📉 LEVERAGE LOW → Reborrow needed"
          : "✅ OK"
      }`.padEnd(65) + "│"
    );
    console.log(
      "└────────────────────────────────────────────────────────────────┘"
    );

    console.log("\n🔗 Test URLs:");
    console.log(`   Demo 1 (High): Login with ${DEMO1_CONFIG.email}`);
    console.log(`   Demo 2 (Low):  Login with ${DEMO2_CONFIG.email}`);
    console.log(`   Then go to /dashboard/recommendations to see the alerts!`);
  } catch (error) {
    console.error("\n❌ Error during seed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run
seedAllDemoPortfolios()
  .then(() => {
    console.log("\n🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
