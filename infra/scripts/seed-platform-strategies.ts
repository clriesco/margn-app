/**
 * Seed script to populate platform strategies with backtest results
 *
 * Reads strategy definitions from platform-strategies.json, fetches historical
 * prices, runs the backtest engine for each strategy, and stores metrics +
 * trajectories so they display in the UI.
 *
 * Environment variables:
 *   DATABASE_URL       — Postgres connection string (falls back to apps/backend/.env)
 *   DELETE_EXISTING    — "true" to delete existing platform strategies before seeding
 *
 * Usage: npx ts-node seed-platform-strategies.ts
 */

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables from backend .env (only in development)
if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "apps/backend/.env") });
}

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";
import { runBacktest } from "../../apps/frontend/lib/backtest/engine/backtest-engine";
import { computeBacktestScore } from "../../apps/frontend/lib/backtest/scoring";
import type {
  BacktestConfig,
  BacktestResult,
  PriceData,
  WindowTrajectory,
} from "../../apps/frontend/lib/backtest/types";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Risk profile backtest params (mirrored from apps/backend/src/shared/risk-profiles.ts)
// ---------------------------------------------------------------------------

interface RiskParams {
  maintenanceMarginRatio: number;
  meanReturnShrinkage: number;
  maxWeight: number;
  minWeight: number;
  windowMonths: number;
}

const RISK_PARAMS: Record<string, RiskParams> = {
  conservative: {
    maintenanceMarginRatio: 0.1,
    meanReturnShrinkage: 0.4,
    maxWeight: 0.25,
    minWeight: 0.1,
    windowMonths: 60,
  },
  moderate: {
    maintenanceMarginRatio: 0.07,
    meanReturnShrinkage: 0.6,
    maxWeight: 0.35,
    minWeight: 0.05,
    windowMonths: 60,
  },
  growth: {
    maintenanceMarginRatio: 0.05,
    meanReturnShrinkage: 0.7,
    maxWeight: 0.4,
    minWeight: 0.05,
    windowMonths: 60,
  },
  aggressive: {
    maintenanceMarginRatio: 0.05,
    meanReturnShrinkage: 0.85,
    maxWeight: 0.5,
    minWeight: 0.0,
    windowMonths: 60,
  },
};

// ---------------------------------------------------------------------------
// Strategy definitions — loaded from JSON file
// ---------------------------------------------------------------------------

interface PlatformStrategy {
  name: string;
  description: string;
  riskProfileId: string;
  weights: Record<string, number>;
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
  weightMode: "manual" | "sharpe" | "equal";
  dynamicWeights: boolean;
}

const JSON_PATH = join(__dirname, "platform-strategies.json");
const PLATFORM_STRATEGIES: PlatformStrategy[] = JSON.parse(
  readFileSync(JSON_PATH, "utf-8")
);

// ---------------------------------------------------------------------------
// Price fetching helpers
// ---------------------------------------------------------------------------

const BACKTEST_INITIAL_CAPITAL = 10000;
const BACKTEST_MONTHLY_CONTRIBUTION = 1000;
const BACKTEST_RISK_FREE_RATE = 0.02;
const PRICE_START_DATE = "2015-01-01";

function guessAssetType(symbol: string): string {
  if (symbol.includes("-USD")) return "crypto";
  if (["GLD", "SLV", "USO", "DBA", "DBC", "COPX", "GDX"].includes(symbol)) return "commodity";
  if (["TLT", "IEF", "SHY", "AGG", "BND", "TIP", "LQD", "HYG", "EMB"].includes(symbol)) return "bond";
  return "index";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download prices from Yahoo Finance for a single symbol.
 * Returns a map of { 'YYYY-MM-DD': closePrice }.
 */
async function fetchFromYahoo(
  symbol: string,
  from: string,
  to: string
): Promise<Record<string, number>> {
  const startTs = Math.floor(new Date(from).getTime() / 1000);
  const endTs = Math.floor(new Date(to).getTime() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance HTTP ${response.status} for ${symbol}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await response.json();
  const chartResult = data.chart?.result?.[0];
  if (!chartResult?.timestamp) {
    throw new Error(`No price data returned for ${symbol}`);
  }

  const timestamps: number[] = chartResult.timestamp;
  const adjCloses: number[] | undefined =
    chartResult.indicators?.adjclose?.[0]?.adjclose;
  const closes: number[] | undefined =
    chartResult.indicators?.quote?.[0]?.close;
  const priceArray = adjCloses || closes;
  if (!priceArray) {
    throw new Error(`No price array in Yahoo response for ${symbol}`);
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
}

/**
 * Ensure an Asset record exists in the DB for the given symbol.
 */
async function ensureAsset(symbol: string): Promise<string> {
  let asset = await prisma.asset.findUnique({ where: { symbol } });
  if (!asset) {
    asset = await prisma.asset.create({
      data: { symbol, name: symbol, assetType: guessAssetType(symbol) },
    });
  }
  return asset.id;
}

/**
 * Cache price data to the DB (AssetPrice table) for future use.
 */
async function cachePricesToDb(
  assetId: string,
  prices: Record<string, number>
): Promise<void> {
  const entries = Object.entries(prices);
  // Batch insert in chunks
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

/**
 * Get price data for a symbol. Tries DB first, falls back to Yahoo.
 */
async function getPricesForSymbol(
  symbol: string,
  from: string,
  to: string,
  minDays: number
): Promise<Record<string, number>> {
  const assetId = await ensureAsset(symbol);

  // Try DB cache first
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
    console.log(`      ${symbol}: ${cached.length} days from DB cache`);
    return result;
  }

  // Download from Yahoo
  console.log(
    `      ${symbol}: ${cached.length} cached days (need ${minDays}), fetching from Yahoo...`
  );
  const yahooPrices = await fetchFromYahoo(symbol, from, to);
  const dayCount = Object.keys(yahooPrices).length;
  console.log(`      ${symbol}: downloaded ${dayCount} days from Yahoo`);

  // Cache to DB for future runs
  await cachePricesToDb(assetId, yahooPrices);

  return yahooPrices;
}

// ---------------------------------------------------------------------------
// Backtest helpers
// ---------------------------------------------------------------------------

/**
 * Build a BacktestConfig from strategy definition and risk profile params.
 */
function buildBacktestConfig(
  strategy: PlatformStrategy,
  riskParams: RiskParams,
  startDate: string,
  endDate: string
): BacktestConfig {
  const config: BacktestConfig = {
    symbols: Object.keys(strategy.weights),
    initialCapital: BACKTEST_INITIAL_CAPITAL,
    monthlyContribution: BACKTEST_MONTHLY_CONTRIBUTION,
    leverageMin: strategy.leverageMin,
    leverageMax: strategy.leverageMax,
    leverageTarget: strategy.leverageTarget,
    startDate,
    endDate,
    windowMonths: riskParams.windowMonths,
    weightMode: strategy.weightMode,
    meanReturnShrinkage: riskParams.meanReturnShrinkage,
    riskFreeRate: BACKTEST_RISK_FREE_RATE,
    maxWeight: riskParams.maxWeight,
    minWeight: riskParams.minWeight,
    maintenanceMarginRatio: riskParams.maintenanceMarginRatio,
  };

  // For manual mode, pass explicit weights
  if (strategy.weightMode === "manual") {
    config.manualWeights = { ...strategy.weights };
  }

  // For sharpe modes, enable dynamic weights if specified
  if (strategy.weightMode === "sharpe" && strategy.dynamicWeights) {
    config.dynamicWeights = true;
  }

  return config;
}

/**
 * Extract daily equity points from a trajectory.
 */
function extractDailyEquity(
  trajectory: WindowTrajectory
): { date: string; equity: number }[] {
  if (!trajectory?.states) return [];
  return trajectory.states.map((s) => ({ date: s.date, equity: s.equity }));
}

/**
 * Extract metrics and trajectories from a BacktestResult into JSON strings
 * matching the format expected by the frontend.
 */
function extractResults(result: BacktestResult): {
  metricsJson: string;
  trajectoriesJson: string;
} {
  const p10Trajectory = result.trajectories[result.p10.windowIndex];
  const p50Trajectory = result.trajectories[result.p50.windowIndex];
  const p90Trajectory = result.trajectories[result.p90.windowIndex];

  const safeNum = (n: number) => (Number.isFinite(n) ? n : 0);

  const score = computeBacktestScore({
    p10: { cagr: safeNum(result.p10.cagr), sharpe: safeNum(result.p10.sharpe), maxDrawdown: result.p10.maxDrawdownEquity },
    p50: { cagr: safeNum(result.p50.cagr), sharpe: safeNum(result.p50.sharpe) },
    p90: { cagr: safeNum(result.p90.cagr), sharpe: safeNum(result.p90.sharpe), maxDrawdown: result.p90.maxDrawdownEquity },
    marginCallCount: result.marginCallCount,
  });

  const metrics = {
    p10: {
      startDate: result.p10.startDate,
      endDate: result.p10.endDate,
      finalCapital: result.p10.finalCapital,
      totalContributed: result.p10.totalContributed,
      returnPercent: result.p10.returnPercent,
      cagr: safeNum(result.p10.cagr),
      xirr: result.p10.xirr,
      sharpe: safeNum(result.p10.sharpe),
      maxDrawdownEquity: result.p10.maxDrawdownEquity,
      recoveryDays: result.p10.recoveryDays,
      underwaterDays: result.p10.underwaterDays,
      finalLeverage: safeNum(result.p10.finalLeverage),
      windowIndex: result.p10.windowIndex,
    },
    p50: {
      startDate: result.p50.startDate,
      endDate: result.p50.endDate,
      finalCapital: result.p50.finalCapital,
      totalContributed: result.p50.totalContributed,
      returnPercent: result.p50.returnPercent,
      cagr: safeNum(result.p50.cagr),
      xirr: result.p50.xirr,
      sharpe: safeNum(result.p50.sharpe),
      maxDrawdownEquity: result.p50.maxDrawdownEquity,
      recoveryDays: result.p50.recoveryDays,
      underwaterDays: result.p50.underwaterDays,
      finalLeverage: safeNum(result.p50.finalLeverage),
      windowIndex: result.p50.windowIndex,
    },
    p90: {
      startDate: result.p90.startDate,
      endDate: result.p90.endDate,
      finalCapital: result.p90.finalCapital,
      totalContributed: result.p90.totalContributed,
      returnPercent: result.p90.returnPercent,
      cagr: safeNum(result.p90.cagr),
      xirr: result.p90.xirr,
      sharpe: safeNum(result.p90.sharpe),
      maxDrawdownEquity: result.p90.maxDrawdownEquity,
      recoveryDays: result.p90.recoveryDays,
      underwaterDays: result.p90.underwaterDays,
      finalLeverage: safeNum(result.p90.finalLeverage),
      windowIndex: result.p90.windowIndex,
    },
    totalWindows: result.totalWindows,
    marginCallCount: result.marginCallCount,
    score,
  };

  const trajectories = {
    p10: { points: extractDailyEquity(p10Trajectory) },
    p50: { points: extractDailyEquity(p50Trajectory) },
    p90: { points: extractDailyEquity(p90Trajectory) },
  };

  return {
    metricsJson: JSON.stringify(metrics),
    trajectoriesJson: JSON.stringify(trajectories),
  };
}

// ---------------------------------------------------------------------------
// AI Analysis generation
// ---------------------------------------------------------------------------

const AI_ANALYSIS_SYSTEM_PROMPT = `Eres un analista cuantitativo senior y experto en comunicación financiera. Tu tarea es escribir un análisis atractivo y profesional de una estrategia de inversión pública, diseñado para captar el interés de potenciales inversores.

CONTEXTO DE LA APLICACIÓN:
Esta es una estrategia de DCA (Dollar Cost Averaging) condicional con apalancamiento dinámico disponible en una plataforma de gestión de portfolios. Opera con margen, manteniendo leverage entre un mínimo y máximo configurado, con contribuciones mensuales y rebalanceo periódico.

IMPORTANTE — LO QUE NO DEBES HACER:
- NO menciones fechas específicas ni eventos históricos concretos (COVID, guerra de Ucrania, etc.)
- NO analices períodos temporales específicos del backtest
- NO sugieras cambios en la ventana de simulación
- Trata la estrategia como un enfoque de inversión atemporal, no como un resultado histórico

TONO Y ENFOQUE:
- Escribe en TERCERA PERSONA (esta estrategia, el portfolio)
- Tono profesional pero atractivo, como un prospecto de inversión
- Enfatiza las fortalezas y ventajas competitivas de la estrategia
- Menciona las debilidades de forma breve y matizada, sin alarmar — presenta los riesgos como aspectos a tener en cuenta, no como impedimentos
- Usa markdown: **negritas**, *cursivas*, y listas con guiones
- Estructura clara con párrafos separados
- Extensión: 250-350 palabras

ESTRUCTURA DEL ANÁLISIS:

1. **TESIS DE INVERSIÓN** (1 párrafo)
   - Rol de cada activo en el portfolio (crecimiento, cobertura, diversificación)
   - Correlaciones esperadas entre los activos
   - Por qué esta combinación es atractiva para capturar rendimiento

2. **RENDIMIENTO Y ROBUSTEZ** (1 párrafo)
   - Destaca las métricas más atractivas (Sharpe alto, buen CAGR, cero margin calls, etc.)
   - Si no hay margin calls, destácalo como señal de solidez
   - Si el drawdown es contenido, preséntalo como ventaja
   - Menciona brevemente la dispersión P10/P90 como contexto, sin dramatizar

3. **PUNTOS DESTACADOS** (lista)
   - 3-4 fortalezas concretas basadas en los datos, presentadas de forma atractiva
   - 1 consideración de riesgo breve y matizada (ej: "como toda estrategia apalancada, requiere horizonte de inversión adecuado")

4. **PERFIL DE INVERSOR** (1 párrafo corto)
   - ¿Para quién es ideal esta estrategia?
   - Horizonte temporal recomendado

IMPORTANTE:
- Sé específico con números del backtest (Sharpe, drawdown, dispersión)
- Prioriza las métricas positivas y presenta la estrategia de forma atractiva
- Si hay cero margin calls, es un punto fuerte importante — destácalo
- Si el score es alto (>70), menciónalo como indicador de calidad`;

function buildAnalysisUserPrompt(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfg: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metrics: Record<string, any>,
): string {
  const weights = cfg.weights as Record<string, number>;
  const symbols = cfg.symbols as string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p10 = metrics.p10 as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p50 = metrics.p50 as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p90 = metrics.p90 as Record<string, any>;

  const formatPct = (v: number) => (v * 100).toFixed(1) + "%";
  const formatUsd = (v: number) =>
    "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const formatNum = (v: number) =>
    Number.isFinite(v) ? v.toFixed(2) : "—";

  const symbolList = symbols
    .map((s: string) => `${s}: ${((weights[s] || 0) * 100).toFixed(1)}%`)
    .join(", ");

  let weightModeDesc: string;
  if (cfg.weightMode === "sharpe") {
    const dynamicDesc = cfg.dynamicWeights
      ? " con re-optimización mensual"
      : " (pesos fijos tras optimización inicial)";
    weightModeDesc = `Optimización Sharpe${dynamicDesc}`;
  } else if (cfg.weightMode === "equal") {
    weightModeDesc = "Pesos iguales (1/n)";
  } else {
    weightModeDesc = "Pesos manuales";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const score = metrics.score as { composite: number; dimensions: Record<string, number> } | undefined;

  let prompt = `Analiza esta estrategia de inversión:

**Nombre:** ${name}
**Activos y pesos:** ${symbolList}
**Capital inicial:** ${formatUsd(cfg.initialCapital)}
**Contribución mensual:** ${formatUsd(cfg.monthlyContribution)}
**Leverage:** ${cfg.leverageTarget}x (rango: ${cfg.leverageMin}x - ${cfg.leverageMax}x)
**Ventana de simulación:** ${cfg.windowMonths} meses
**Estrategia de pesos:** ${weightModeDesc}

**Métricas del backtest (P10 / P50 / P90):**

| Métrica | P10 | P50 | P90 |
|---------|-----|-----|-----|
| Capital Final | ${formatUsd(p10.finalCapital)} | ${formatUsd(p50.finalCapital)} | ${formatUsd(p90.finalCapital)} |
| CAGR | ${formatPct(p10.cagr)} | ${formatPct(p50.cagr)} | ${formatPct(p90.cagr)} |
| Sharpe | ${formatNum(p10.sharpe)} | ${formatNum(p50.sharpe)} | ${formatNum(p90.sharpe)} |
| Max Drawdown | ${formatPct(p10.maxDrawdownEquity)} | ${formatPct(p50.maxDrawdownEquity)} | ${formatPct(p90.maxDrawdownEquity)} |
| Recovery (días) | ${p10.recoveryDays} | ${p50.recoveryDays} | ${p90.recoveryDays} |
| Días bajo el agua | ${p10.underwaterDays} | ${p50.underwaterDays} | ${p90.underwaterDays} |

**Total ventanas evaluadas:** ${metrics.totalWindows}
**Margin calls:** ${metrics.marginCallCount}`;

  if (score) {
    prompt += `\n\n**Score compuesto:** ${Math.round(score.composite)}/100`;
    if (score.dimensions) {
      prompt += ` (Consistencia: ${Math.round(score.dimensions.dispersion)}, Riesgo/Retorno: ${Math.round(score.dimensions.worstCase)}, Sharpe: ${Math.round(score.dimensions.sharpe)}, Drawdown: ${Math.round(score.dimensions.drawdown)})`;
    }
  }

  prompt +=
    "\n\nAnaliza esta estrategia como un enfoque de inversión atemporal, enfocándote en sus características estructurales y perfil de riesgo.";

  return prompt;
}

/**
 * Generate AI analysis for a strategy using Claude API (non-streaming).
 * Returns the analysis text, or null if generation fails.
 */
async function generateAIAnalysis(
  name: string,
  configJson: string,
  metricsJson: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("      SKIP AI analysis: ANTHROPIC_API_KEY not set");
    return null;
  }

  const client = new Anthropic({ apiKey });
  const cfg = JSON.parse(configJson);
  const metrics = JSON.parse(metricsJson);

  const userPrompt = buildAnalysisUserPrompt(name, cfg, metrics);

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: AI_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    return textBlock ? textBlock.text : null;
  } catch (err) {
    console.error(
      `      AI analysis error: ${err instanceof Error ? err.message : err}`
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function seedPlatformStrategies() {
  console.log("=== Seeding platform strategies with backtest results ===\n");
  console.log(`Loaded ${PLATFORM_STRATEGIES.length} strategies from ${JSON_PATH}\n`);

  // 1. Optionally delete existing platform strategies
  const deleteExisting = process.env.DELETE_EXISTING === "true";
  if (deleteExisting) {
    const deleted = await prisma.savedStrategy.deleteMany({
      where: { isPlatform: true },
    });
    console.log(`Deleted ${deleted.count} existing platform strategies\n`);
  } else {
    const existing = await prisma.savedStrategy.count({
      where: { isPlatform: true },
    });
    console.log(`Keeping ${existing} existing platform strategies (DELETE_EXISTING != true)\n`);
  }

  // 2. Collect all unique symbols
  const allSymbols = new Set<string>();
  for (const s of PLATFORM_STRATEGIES) {
    for (const sym of Object.keys(s.weights)) {
      allSymbols.add(sym);
    }
  }
  console.log(
    `Unique symbols to fetch: ${[...allSymbols].join(", ")} (${allSymbols.size} total)\n`
  );

  // 3. Fetch prices for all symbols
  const endDate = new Date().toISOString().split("T")[0];
  const priceCache: Record<string, Record<string, number>> = {};

  console.log("--- Fetching price data ---");
  for (const symbol of allSymbols) {
    try {
      priceCache[symbol] = await getPricesForSymbol(
        symbol,
        PRICE_START_DATE,
        endDate,
        500 // Minimum days needed to consider DB cache sufficient
      );
    } catch (err) {
      console.error(
        `   ERROR fetching ${symbol}: ${err instanceof Error ? err.message : err}`
      );
      priceCache[symbol] = {};
    }
    // Rate limit between Yahoo calls
    await delay(600);
  }
  console.log("");

  // 4. Run backtests and create strategies
  let created = 0;
  let failed = 0;

  for (let i = 0; i < PLATFORM_STRATEGIES.length; i++) {
    const strategy = PLATFORM_STRATEGIES[i];
    const riskParams = RISK_PARAMS[strategy.riskProfileId];
    const num = `[${i + 1}/${PLATFORM_STRATEGIES.length}]`;

    const modeLabel = strategy.dynamicWeights
      ? "sharpe dinámico"
      : strategy.weightMode;
    console.log(
      `${num} ${strategy.riskProfileId}: "${strategy.name}" [${modeLabel}] (${Object.keys(strategy.weights).join(", ")})`
    );

    // Build price data for this strategy's symbols
    const strategyPrices: PriceData = {};
    let missingSymbol = false;
    for (const sym of Object.keys(strategy.weights)) {
      if (
        !priceCache[sym] ||
        Object.keys(priceCache[sym]).length === 0
      ) {
        console.log(`      SKIP: no price data for ${sym}`);
        missingSymbol = true;
        break;
      }
      strategyPrices[sym] = priceCache[sym];
    }

    if (missingSymbol) {
      // Create without metrics (fallback)
      await createStrategyRecord(strategy, null, null);
      console.log(`      Created without metrics (missing price data)\n`);
      created++;
      continue;
    }

    // Run backtest
    try {
      const backtestConfig = buildBacktestConfig(
        strategy,
        riskParams,
        PRICE_START_DATE,
        endDate
      );

      console.log(
        `      Running backtest (${riskParams.windowMonths}mo windows)...`
      );
      const result = runBacktest(backtestConfig, strategyPrices);
      const { metricsJson, trajectoriesJson } = extractResults(result);

      const parsedScore = JSON.parse(metricsJson).score;
      console.log(
        `      ${result.totalWindows} windows, ` +
          `P50 CAGR: ${(result.p50.cagr * 100).toFixed(1)}%, ` +
          `Sharpe: ${result.p50.sharpe.toFixed(2)}, ` +
          `MaxDD: ${(result.p50.maxDrawdownEquity * 100).toFixed(1)}%, ` +
          `Margin calls: ${result.marginCallCount}, ` +
          `Score: ${parsedScore.composite}`
      );

      // Generate AI analysis
      console.log(`      Generating AI analysis...`);
      const configJson = JSON.stringify({
        symbols: Object.keys(strategy.weights),
        weights: strategy.weights,
        initialCapital: BACKTEST_INITIAL_CAPITAL,
        monthlyContribution: BACKTEST_MONTHLY_CONTRIBUTION,
        leverageMin: strategy.leverageMin,
        leverageMax: strategy.leverageMax,
        leverageTarget: strategy.leverageTarget,
        windowMonths: RISK_PARAMS[strategy.riskProfileId].windowMonths,
        weightMode: strategy.weightMode,
        dynamicWeights: strategy.dynamicWeights,
      });
      const aiAnalysis = await generateAIAnalysis(strategy.name, configJson, metricsJson);
      if (aiAnalysis) {
        console.log(`      AI analysis generated (${aiAnalysis.length} chars)`);
      }

      await createStrategyRecord(strategy, metricsJson, trajectoriesJson, aiAnalysis);
      console.log(`      Saved with metrics, trajectories, and AI analysis\n`);
      created++;
    } catch (err) {
      console.error(
        `      BACKTEST ERROR: ${err instanceof Error ? err.message : err}`
      );
      // Create without metrics (fallback)
      await createStrategyRecord(strategy, null, null);
      console.log(`      Created without metrics (backtest failed)\n`);
      created++;
      failed++;
    }
  }

  console.log("=== Summary ===");
  console.log(`Created: ${created} strategies`);
  if (failed > 0) {
    console.log(`Failed backtests: ${failed} (created without metrics)`);
  }
}

async function createStrategyRecord(
  strategy: PlatformStrategy,
  metricsJson: string | null,
  trajectoriesJson: string | null,
  aiAnalysis: string | null = null,
) {
  const configJson = JSON.stringify({
    symbols: Object.keys(strategy.weights),
    weights: strategy.weights,
    initialCapital: BACKTEST_INITIAL_CAPITAL,
    monthlyContribution: BACKTEST_MONTHLY_CONTRIBUTION,
    leverageMin: strategy.leverageMin,
    leverageMax: strategy.leverageMax,
    leverageTarget: strategy.leverageTarget,
    windowMonths: RISK_PARAMS[strategy.riskProfileId].windowMonths,
    weightMode: strategy.weightMode,
    dynamicWeights: strategy.dynamicWeights,
  });

  await prisma.savedStrategy.create({
    data: {
      userId: null,
      name: strategy.name,
      description: strategy.description,
      configJson,
      metricsJson,
      trajectoriesJson,
      aiAnalysis,
      isPublic: true,
      isPlatform: true,
      riskProfileId: strategy.riskProfileId,
    },
  });
}

seedPlatformStrategies()
  .then(() => {
    console.log("\nDone!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
