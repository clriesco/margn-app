/**
 * Backfill AI analysis for all saved strategies that have metrics but no analysis.
 *
 * Uses the same prompt as StrategyAnalysisService (atemporal, structural).
 * For platform strategies, uses a marketing-oriented prompt (3rd person).
 *
 * Environment variables:
 *   DATABASE_URL       — Postgres connection string (falls back to apps/backend/.env)
 *   ANTHROPIC_API_KEY  — Required for AI generation
 *   DRY_RUN            — "true" to list strategies without generating (default: false)
 *
 * Usage: npx ts-node backfill-ai-analysis.ts
 */

import { config } from "dotenv";
import { join } from "path";

if (!process.env.DATABASE_URL) {
  config({ path: join(process.cwd(), "../../apps/backend/.env") });
}

import Anthropic from "@anthropic-ai/sdk";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const USER_STRATEGY_SYSTEM_PROMPT = `Eres un analista cuantitativo senior experto en construcción de portfolios, gestión de riesgo y estrategias de inversión apalancadas. Tu tarea es analizar una estrategia de inversión guardada como un enfoque de inversión atemporal, enfocándote en sus características estructurales.

CONTEXTO DE LA APLICACIÓN:
Esta es una estrategia de DCA (Dollar Cost Averaging) condicional con apalancamiento dinámico. Opera con margen, manteniendo leverage entre un mínimo y máximo configurado, con contribuciones mensuales y rebalanceo periódico.

IMPORTANTE — LO QUE NO DEBES HACER:
- NO menciones fechas específicas ni eventos históricos concretos (COVID, guerra de Ucrania, etc.)
- NO analices períodos temporales específicos del backtest
- NO sugieras cambios en la ventana de simulación
- Trata la estrategia como un enfoque de inversión atemporal, no como un resultado histórico

FORMATO DE RESPUESTA:
- Escribe en SEGUNDA PERSONA (tu estrategia, tu portfolio)
- Usa markdown: **negritas**, *cursivas*, y listas con guiones
- Estructura clara con párrafos separados
- Extensión: 250-350 palabras

ESTRUCTURA DEL ANÁLISIS:

1. **TESIS DE INVERSIÓN** (1 párrafo)
   - Rol de cada activo en el portfolio (crecimiento, cobertura, diversificación)
   - Correlaciones esperadas entre los activos
   - A qué régimen de mercado se adapta mejor esta combinación

2. **PERFIL DE RIESGO** (1 párrafo)
   - Implicaciones del nivel de apalancamiento elegido
   - Dispersión entre escenarios P10 y P90: ¿qué tan dependiente es del timing?
   - Robustez ante margin calls
   - Análisis del drawdown máximo en escenarios adversos

3. **FORTALEZAS Y DEBILIDADES** (lista)
   - 2-3 fortalezas concretas basadas en los datos
   - 2-3 debilidades o riesgos estructurales

4. **PERFIL DE INVERSOR** (1 párrafo corto)
   - ¿Para quién es ideal esta estrategia?
   - Tolerancia al riesgo necesaria
   - Horizonte temporal recomendado

IMPORTANTE:
- Sé específico con números del backtest (Sharpe, drawdown, dispersión)
- Conecta cada observación con datos concretos de las métricas
- Si hay margin calls, analiza la robustez estructural, no el período específico
- Si el score está disponible, úsalo como referencia de calidad global`;

const PLATFORM_STRATEGY_SYSTEM_PROMPT = `Eres un analista cuantitativo senior y experto en comunicación financiera. Tu tarea es escribir un análisis atractivo y profesional de una estrategia de inversión pública, diseñado para captar el interés de potenciales inversores.

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

// ---------------------------------------------------------------------------
// Prompt builder (shared)
// ---------------------------------------------------------------------------

function buildUserPrompt(
  name: string,
  config: Record<string, unknown>,
  metrics: Record<string, unknown>,
): string {
  const weights = config.weights as Record<string, number>;
  const symbols = config.symbols as string[];
  const p10 = metrics.p10 as Record<string, number>;
  const p50 = metrics.p50 as Record<string, number>;
  const p90 = metrics.p90 as Record<string, number>;

  const formatPct = (v: number) => (v * 100).toFixed(1) + "%";
  const formatUsd = (v: number) =>
    "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const formatNum = (v: number) =>
    Number.isFinite(v) ? v.toFixed(2) : "—";

  const symbolList = symbols
    .map((s: string) => `${s}: ${((weights[s] || 0) * 100).toFixed(1)}%`)
    .join(", ");

  let weightModeDesc: string;
  if (config.weightMode === "sharpe") {
    const dynamicDesc = config.dynamicWeights
      ? " con re-optimización mensual"
      : " (pesos fijos tras optimización inicial)";
    weightModeDesc = `Optimización Sharpe${dynamicDesc}`;
  } else if (config.weightMode === "equal") {
    weightModeDesc = "Pesos iguales (1/n)";
  } else {
    weightModeDesc = "Pesos manuales";
  }

  const score = metrics.score as
    | { composite: number; dimensions: Record<string, number> }
    | undefined;

  let prompt = `Analiza esta estrategia de inversión:

**Nombre:** ${name}
**Activos y pesos:** ${symbolList}
**Capital inicial:** ${formatUsd(config.initialCapital as number)}
**Contribución mensual:** ${formatUsd(config.monthlyContribution as number)}
**Leverage:** ${config.leverageTarget}x (rango: ${config.leverageMin}x - ${config.leverageMax}x)
**Ventana de simulación:** ${config.windowMonths} meses
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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfillAIAnalysis() {
  const dryRun = process.env.DRY_RUN === "true";
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey && !dryRun) {
    console.error("ERROR: ANTHROPIC_API_KEY is required (set DRY_RUN=true to list only)");
    process.exit(1);
  }

  const client = apiKey ? new Anthropic({ apiKey }) : null;

  // Find strategies with metrics but no AI analysis
  const strategies = await prisma.savedStrategy.findMany({
    where: {
      aiAnalysis: null,
      metricsJson: { not: null },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      isPlatform: true,
      configJson: true,
      metricsJson: true,
    },
  });

  console.log(`=== Backfill AI Analysis ===\n`);
  console.log(`Found ${strategies.length} strategies without AI analysis\n`);

  if (strategies.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  if (dryRun) {
    console.log("DRY RUN — listing strategies only:\n");
    for (const s of strategies) {
      const config = JSON.parse(s.configJson);
      const symbols = (config.symbols as string[]).join(", ");
      console.log(`  ${s.isPlatform ? "[platform]" : "[user]    "} ${s.name} (${symbols})`);
    }
    console.log(`\nTotal: ${strategies.length}`);
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < strategies.length; i++) {
    const s = strategies[i];
    const num = `[${i + 1}/${strategies.length}]`;
    const type = s.isPlatform ? "platform" : "user";
    console.log(`${num} [${type}] "${s.name}"`);

    const config = JSON.parse(s.configJson);
    const metrics = JSON.parse(s.metricsJson!);
    const systemPrompt = s.isPlatform
      ? PLATFORM_STRATEGY_SYSTEM_PROMPT
      : USER_STRATEGY_SYSTEM_PROMPT;
    const userPrompt = buildUserPrompt(s.name, config, metrics);

    try {
      const message = await client!.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      const analysis = textBlock ? textBlock.text : null;

      if (analysis) {
        await prisma.savedStrategy.update({
          where: { id: s.id },
          data: { aiAnalysis: analysis },
        });
        console.log(`      OK (${analysis.length} chars)`);
        success++;
      } else {
        console.log(`      SKIP: empty response`);
        failed++;
      }
    } catch (err) {
      console.error(
        `      ERROR: ${err instanceof Error ? err.message : err}`
      );
      failed++;
    }

    // Rate limit between API calls
    if (i < strategies.length - 1) {
      await delay(1000);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

backfillAIAnalysis()
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
