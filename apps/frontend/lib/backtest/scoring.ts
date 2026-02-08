/**
 * Composite scoring for backtest results.
 *
 * Same 4 dimensions as explore-portfolios.ts, but normalised to 0-100 using
 * fixed absolute bounds (instead of relative percentile ranking) so a single
 * backtest can be scored without needing a pool of candidates.
 *
 * Weights: dispersion 0.35, worstCase 0.25, sharpe 0.25, drawdown 0.15
 */

export interface BacktestScore {
  composite: number; // 0-100
  dimensions: {
    dispersion: number; // 0-100  (consistency across windows)
    worstCase: number; // 0-100  (P10 risk/reward ratio)
    sharpe: number; // 0-100
    drawdown: number; // 0-100
  };
  marginCallPenalty: boolean;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function computeBacktestScore(input: {
  p10: { cagr: number; sharpe: number; maxDrawdown: number };
  p50: { cagr: number; sharpe: number };
  p90: { cagr: number; sharpe: number; maxDrawdown: number };
  marginCallCount: number;
}): BacktestScore {
  const { p10, p50, p90, marginCallCount } = input;

  // ---- Raw dimension values (identical to explore-portfolios.ts) ----

  // Dispersion: lower is better
  const p50Cagr = Math.abs(p50.cagr) > 0.001 ? p50.cagr : 0.001;
  const cagrCV = Math.min(
    10,
    (p90.cagr - p10.cagr) / Math.abs(p50Cagr),
  );

  const sharpeConsistency =
    p90.sharpe > 0
      ? Math.max(0, Math.min(1, p10.sharpe / p90.sharpe))
      : 0;

  const drawdownSpread =
    Math.abs(p10.maxDrawdown) - Math.abs(p90.maxDrawdown);

  const dispersionRaw =
    0.4 * cagrCV + 0.3 * (1 - sharpeConsistency) + 0.3 * drawdownSpread;

  // Worst case: higher is better (P10 CAGR per unit drawdown)
  const p10DD = Math.abs(p10.maxDrawdown);
  const worstCaseRaw = p10DD > 0 ? p10.cagr / p10DD : 0;

  // Sharpe: higher is better (weighted toward P10)
  const sharpeRaw = 0.6 * p10.sharpe + 0.4 * p50.sharpe;

  // Drawdown: lower absolute is better
  const drawdownRaw = Math.abs(p10.maxDrawdown);

  // ---- Absolute normalisation (linear, clamped 0-100) ----

  const dispersionScore = clamp(100 - dispersionRaw * 33.3, 0, 100);
  const worstCaseScore = clamp(worstCaseRaw * 20, 0, 100);
  const sharpeScore = clamp(sharpeRaw * 40, 0, 100);
  const drawdownScore = clamp(100 - drawdownRaw * 200, 0, 100);

  // ---- Composite ----

  let composite =
    0.35 * dispersionScore +
    0.25 * worstCaseScore +
    0.25 * sharpeScore +
    0.15 * drawdownScore;

  const marginCallPenalty = marginCallCount > 0;
  if (marginCallPenalty) {
    composite = Math.min(composite, 20);
  }

  composite = Math.round(composite * 10) / 10;

  return {
    composite,
    dimensions: {
      dispersion: Math.round(dispersionScore * 10) / 10,
      worstCase: Math.round(worstCaseScore * 10) / 10,
      sharpe: Math.round(sharpeScore * 10) / 10,
      drawdown: Math.round(drawdownScore * 10) / 10,
    },
    marginCallPenalty,
  };
}

/** Color for a 0-100 score */
export function scoreColor(score: number): string {
  if (score >= 70) return '#34d399';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}
