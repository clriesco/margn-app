import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StrategyAnalysisService {
  private readonly logger = new Logger(StrategyAnalysisService.name);
  private client: Anthropic | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      this.client = new Anthropic({ apiKey });
    }
    return this.client;
  }

  async *streamAnalysis(strategyId: string): AsyncGenerator<string> {
    const client = this.getClient();

    // 1. Fetch strategy from DB
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    const config = JSON.parse(strategy.configJson);
    const metrics = strategy.metricsJson
      ? JSON.parse(strategy.metricsJson)
      : null;

    if (!metrics) {
      throw new Error('Strategy has no metrics to analyze');
    }

    const systemPrompt = `Eres un analista cuantitativo senior experto en construcción de portfolios, gestión de riesgo y estrategias de inversión apalancadas. Tu tarea es analizar una estrategia de inversión guardada como un enfoque de inversión atemporal, enfocándote en sus características estructurales.

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

    const userPrompt = this.buildUserPrompt(strategy.name, config, metrics);

    try {
      const stream = await client.messages.stream({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      let fullText = '';

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta'
        ) {
          fullText += event.delta.text;
          yield event.delta.text;
        }
      }

      // Persist the completed analysis
      await this.prisma.savedStrategy.update({
        where: { id: strategyId },
        data: { aiAnalysis: fullText },
      });

      this.logger.log(`AI analysis persisted for strategy ${strategyId}`);
    } catch (error) {
      this.logger.error('Error streaming strategy analysis:', error);

      if (error instanceof Anthropic.RateLimitError) {
        throw new Error('Rate limit exceeded. Please try again in a moment.');
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error(
          'API authentication failed. Please check configuration.',
        );
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new Error('Unable to connect to AI service. Please try again.');
      }

      throw new Error('Failed to generate analysis. Please try again.');
    }
  }

  private buildUserPrompt(
    name: string,
    config: Record<string, unknown>,
    metrics: Record<string, unknown>,
  ): string {
    const weights = config.weights as Record<string, number>;
    const symbols = config.symbols as string[];
    const p10 = metrics.p10 as Record<string, number>;
    const p50 = metrics.p50 as Record<string, number>;
    const p90 = metrics.p90 as Record<string, number>;

    const formatPct = (v: number) => (v * 100).toFixed(1) + '%';
    const formatUsd = (v: number) =>
      '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
    const formatNum = (v: number) =>
      Number.isFinite(v) ? v.toFixed(2) : '—';

    const symbolList = symbols
      .map((s: string) => `${s}: ${((weights[s] || 0) * 100).toFixed(1)}%`)
      .join(', ');

    // Weight mode description
    let weightModeDesc: string;
    if (config.weightMode === 'sharpe') {
      const dynamicDesc = config.dynamicWeights
        ? ' con re-optimización mensual'
        : ' (pesos fijos tras optimización inicial)';
      weightModeDesc = `Optimización Sharpe${dynamicDesc}`;
    } else if (config.weightMode === 'equal') {
      weightModeDesc = 'Pesos iguales (1/n)';
    } else {
      weightModeDesc = 'Pesos manuales';
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
      '\n\nAnaliza esta estrategia como un enfoque de inversión atemporal, enfocándote en sus características estructurales y perfil de riesgo.';

    return prompt;
  }
}
