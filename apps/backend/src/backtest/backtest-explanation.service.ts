import Anthropic from "@anthropic-ai/sdk";
import { Injectable, Logger } from "@nestjs/common";

import { ExplainBacktestDto } from "./dto/explain-backtest.dto";

@Injectable()
export class BacktestExplanationService {
  private readonly logger = new Logger(BacktestExplanationService.name);
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is not set");
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async *streamExplanation(dto: ExplainBacktestDto): AsyncGenerator<string> {
    const client = this.getClient();

    const systemPrompt = `Eres un analista cuantitativo senior experto en estrategias de inversión apalancadas, ciclos de mercado y macroeconomía. Tu tarea es proporcionar un análisis profundo de los resultados de un backtest.

CONTEXTO DE LA APLICACIÓN Y ESTRATEGIA:
Esta explicación es parte de una aplicación de gestión de portfolios con DCA apalancado. La estrategia funciona así:

**Mecánica del apalancamiento:**
- El portfolio opera con margen, manteniendo un leverage efectivo entre un mínimo y máximo configurado
- Hay una aportación inicial que se despliega totalmente y luego se van añadiendo aportaciones mensuales
- Las aportaciones mensuales no se despliegan totalmente hasta que el leverage no sube por encima del máximo. Mientras tanto, contribuyen al equity pero no al exposure
- Cada mes se evalúa el leverage actual (exposure / equity)
- Si el leverage cae por debajo del mínimo (porque el mercado subió), se re-pide prestado para volver al target
- Si el margen cae por debajo del ratio de mantenimiento → MARGIN CALL (liquidación)

**Modos de pesos y rebalanceo:**
- **Sharpe auto**: Los pesos iniciales se calculan optimizando el Sharpe ratio. Cada mes se rebalancea para mantener esos pesos.
  - Sub-opción "Re-optimizar pesos mensualmente": Si está activada, cada mes se recalculan los pesos óptimos usando los últimos 12 meses de histórico (rolling window). Si no está activada, los pesos se fijan al inicio y solo se rebalancea para mantenerlos.
- **Pesos iguales**: Todos los activos tienen el mismo peso (1/n). Cada mes se rebalancea para volver a pesos iguales.
- **Pesos manuales**: El usuario define los pesos manualmente. Cada mes se rebalancea para mantener esos pesos fijos.

**Parámetros modificables por el usuario:**
- Leverage (target, mínimo y máximo) entre 1x y 5x
- Pesos de los activos o modo de optimización (Sharpe/manual/igual)
- Parámetros Sharpe: shrinkage, risk-free rate, peso mín/máx por activo
- Contribución mensual
- Ratio de margen de mantenimiento

**Lo que NO puede modificar (no sugieras esto):**
- La ventana de simulación está limitada a opciones predefinidas (12, 24, 36, 48, 60 meses). No sugieras ventanas más largas.
- La frecuencia de rebalanceo es mensual fija
- No puede hacer backtests con datos futuros

FORMATO DE RESPUESTA:
- Escribe en PRIMERA PERSONA PLURAL (nosotros, nuestro portfolio)
- Usa markdown: **negritas**, *cursivas*, y listas con guiones cuando sea apropiado
- Estructura clara con párrafos separados (usa líneas en blanco entre secciones)
- Extensión: 300-400 palabras. Prioriza profundidad sobre brevedad.

ESTRUCTURA DEL ANÁLISIS:

1. **CONTEXTO DE ACTIVOS** (1 párrafo)
   - Naturaleza de cada activo: ¿qué representa? ¿cuál es su driver principal?
   - Para crypto: menciona los ciclos de 4 años (halvings de Bitcoin), bull/bear markets
   - Para commodities: rol como refugio, correlación con inflación/dólar
   - Para índices: exposición a economía real, sensibilidad a tipos de interés
   - Correlaciones esperadas entre los activos del portfolio

2. **ANÁLISIS MACRO DEL PERÍODO** (1-2 párrafos)
   - Identifica eventos clave según las fechas: COVID-19 (2020), guerra Ucrania (2022), crisis crypto (2018, 2022), subidas de tipos Fed (2022-2023), rally post-pandemia (2020-2021)
   - Conecta estos eventos con el comportamiento del portfolio
   - Si hubo margin calls, analiza qué período/evento probablemente los causó

3. **INTERPRETACIÓN DE ESCENARIOS** (1-2 párrafos con lista)
   - Explica la dispersión P10/P50/P90
   - Si P10 y P50 son margin calls pero P90 no, explica qué timing/período hizo la diferencia
   - Lista los factores clave que separaron el éxito del fracaso:
     - Punto de entrada en el ciclo
     - Eventos de cola (black swans)
     - Correlaciones que fallaron en crisis

4. **CONCLUSIÓN Y RIESGO** (1 párrafo corto)
   - Valoración honesta: ¿es viable esta estrategia?
   - Qué tipo de inversor podría considerarla

5. **RECOMENDACIONES DE MEJORA** (lista con 2-3 sugerencias concretas y accionables)
   Basándote en los datos, sugiere ajustes que el usuario PUEDE hacer en la app:
   - Si hubo margin calls → recomendar reducir apalancamiento (especificar a cuánto, ej: "reducir leverage target de 3x a 2x")
   - Si max drawdown P90 es bajo (<30%) y no hubo margin calls → hay margen para subir apalancamiento
   - Si los activos están muy correlacionados en crisis → sugerir añadir activos refugio o descorrelacionados. Decide tú qué activo específico recomendar según la composición del portfolio
   - Si un activo domina las pérdidas → sugerir reducir su peso o eliminarlo del portfolio
   - Si hay mucha dispersión P10/P90 → la estrategia depende demasiado del timing, sugerir aumentar contribución mensual para promediar mejor
   - Si el drawdown threshold es muy alto → sugerir bajarlo para desplegar capital antes en caídas

   IMPORTANTE: Cada recomendación debe ser algo que el usuario pueda cambiar en la configuración de la app. Sé específico con números: no digas "reducir riesgo", di "reducir leverage target de 3x a 2.5x" o "añadir un 10-15% en un activo descorrelacionado".

IMPORTANTE:
- Sé específico con fechas y números del backtest
- No generalices: conecta cada observación con datos concretos
- Si hay margin calls, ese es el punto central del análisis
- Muestra conocimiento profundo de los mercados, no solo matemáticas
- Si recomiendas activos específicos, usa tickers de Yahoo Finance para que el usuario pueda añadirlos directamente`;

    const userPrompt = this.buildUserPrompt(dto);

    try {
      const stream = await client.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield event.delta.text;
        }
      }
    } catch (error) {
      this.logger.error("Error streaming explanation:", error);

      if (error instanceof Anthropic.RateLimitError) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error(
          "API authentication failed. Please check configuration.",
        );
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new Error("Unable to connect to AI service. Please try again.");
      }

      throw new Error("Failed to generate explanation. Please try again.");
    }
  }

  private formatMonthlyReturns(
    monthlyReturns: Record<string, number> | undefined,
  ): string {
    if (!monthlyReturns || Object.keys(monthlyReturns).length === 0) {
      return "No disponible";
    }

    const months = Object.keys(monthlyReturns).sort();
    const lines: string[] = [];

    for (const month of months) {
      const ret = monthlyReturns[month];
      const sign = ret >= 0 ? "+" : "";
      lines.push(`${month}: ${sign}${(ret * 100).toFixed(1)}%`);
    }

    return lines.join(", ");
  }

  private buildUserPrompt(dto: ExplainBacktestDto): string {
    const { weights, scenarios, config, excludedSymbols } = dto;
    const { p10, p50, p90 } = scenarios;

    const symbolList = Object.entries(weights)
      .map(([symbol, weight]) => `${symbol}: ${(weight * 100).toFixed(1)}%`)
      .join(", ");

    const formatUsd = (v: number) =>
      "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
    const formatPct = (v: number) => (v * 100).toFixed(1) + "%";

    // Format weight mode description
    let weightModeDesc: string;
    if (config.weightMode === "sharpe") {
      const dynamicDesc = config.dynamicWeights
        ? ` con re-optimización mensual (lookback: ${config.dynamicWeightsLookback ?? 12} meses)`
        : " (pesos fijos tras optimización inicial)";
      weightModeDesc = `Optimización Sharpe${dynamicDesc} (shrinkage: ${config.meanReturnShrinkage ?? 0.6}, risk-free: ${((config.riskFreeRate ?? 0.02) * 100).toFixed(1)}%)`;
    } else if (config.weightMode === "equal") {
      weightModeDesc = "Pesos iguales (1/n)";
    } else {
      weightModeDesc = "Pesos manuales";
    }

    // Format weight constraints if sharpe mode
    const weightConstraints =
      config.weightMode === "sharpe" && config.minWeight && config.maxWeight
        ? ` con límites ${(config.minWeight * 100).toFixed(0)}%-${(config.maxWeight * 100).toFixed(0)}% por activo`
        : "";

    let prompt = `Analiza estos resultados de backtest:

**Portfolio:** ${symbolList}
**Capital inicial:** ${formatUsd(config.initialCapital)}
**Contribución mensual:** ${formatUsd(config.monthlyContribution)}
**Leverage:** ${config.leverageMin}x - ${config.leverageMax}x (objetivo: ${config.leverageTarget}x)
**Margen de mantenimiento:** ${((config.maintenanceMarginRatio ?? 0.05) * 100).toFixed(0)}%
**Ventana de simulación:** ${config.windowMonths} meses
**Total ventanas evaluadas:** ${config.totalWindows}
**Margin calls:** ${config.marginCallCount}

**Estrategia de pesos:** ${weightModeDesc}${weightConstraints}`;

    if (excludedSymbols && excludedSymbols.length > 0) {
      prompt += `\n**Activos excluidos (sin datos):** ${excludedSymbols.join(", ")}`;
    }

    prompt += `

**Escenario P10 (peor 10%):**
- Período: ${p10.startDate} a ${p10.endDate}
- Capital final: ${formatUsd(p10.finalCapital)} (${formatPct(p10.returnPercent)} retorno)
- CAGR: ${formatPct(p10.cagr)}, Sharpe: ${p10.sharpe.toFixed(2)}
- Max drawdown: ${formatPct(p10.maxDrawdownEquity)}, Recovery: ${p10.recoveryDays} días
- Días bajo el agua: ${p10.underwaterDays}
- Retornos mensuales: ${this.formatMonthlyReturns(p10.monthlyReturns)}

**Escenario P50 (mediana):**
- Período: ${p50.startDate} a ${p50.endDate}
- Capital final: ${formatUsd(p50.finalCapital)} (${formatPct(p50.returnPercent)} retorno)
- CAGR: ${formatPct(p50.cagr)}, Sharpe: ${p50.sharpe.toFixed(2)}
- Max drawdown: ${formatPct(p50.maxDrawdownEquity)}, Recovery: ${p50.recoveryDays} días
- Días bajo el agua: ${p50.underwaterDays}
- Retornos mensuales: ${this.formatMonthlyReturns(p50.monthlyReturns)}

**Escenario P90 (mejor 10%):**
- Período: ${p90.startDate} a ${p90.endDate}
- Capital final: ${formatUsd(p90.finalCapital)} (${formatPct(p90.returnPercent)} retorno)
- CAGR: ${formatPct(p90.cagr)}, Sharpe: ${p90.sharpe.toFixed(2)}
- Max drawdown: ${formatPct(p90.maxDrawdownEquity)}, Recovery: ${p90.recoveryDays} días
- Días bajo el agua: ${p90.underwaterDays}
- Retornos mensuales: ${this.formatMonthlyReturns(p90.monthlyReturns)}

Analiza estos resultados conectando los retornos mensuales con eventos macro y ciclos de mercado específicos.`;

    return prompt;
  }
}
