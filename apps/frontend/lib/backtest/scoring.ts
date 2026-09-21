/**
 * Composite scoring for backtest results.
 *
 * Same 4 dimensions as explore-portfolios.ts, but normalised to 0-100 using
 * fixed absolute scales (instead of relative percentile ranking) so a single
 * backtest can be scored without needing a pool of candidates.
 *
 * The composite is the geometric mean of the four dimensions, unweighted. A weighted
 * average lets strong dimensions buy back a disastrous one (an 80+ in Sharpe used to hide
 * a 70% drawdown); with a geometric mean no dimension can be compensated away, a ruinous
 * one takes the whole score down with it, and there are no weights to pick by hand.
 *
 * The scales are calibrated on time-weighted metrics so that 95 means "excellent, and it
 * exists": a Sharpe of 1.5, a worst case that earns per year what it can lose, a drawdown
 * within 18%, and P10/P90 scenarios within about a quarter of the median. An unleveraged
 * S&P 500 buy-and-hold lands around 70. Reference points:
 *   sharpe       0.5 -> 63   1.0 -> 86   1.5 -> 95
 *   worstCase    0.3 -> 59   0.6 -> 83   1.0 -> 95   (P10 CAGR per unit of P10 drawdown)
 *   drawdown     10% -> 98   35% -> 81   50% -> 61   80% -> 0
 *   dispersion   0.2 -> 100  0.4 -> 75   0.6 -> 50   1.0 -> 0   (raw spread, lower is better)
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

/**
 * 0-100 with diminishing returns: going from a Sharpe of 0.5 to 1.0 matters far more than
 * from 1.5 to 2.0, and no realistic value pins the score at 100. Negative values score 0.
 */
function saturating(value: number, rate: number): number {
  return 100 * (1 - Math.exp(-rate * Math.max(0, value)));
}

const SHARPE_RATE = 2;
const WORST_CASE_RATE = 3;
/**
 * P10, P50 and P90 are different windows, so some spread is unavoidable: anything up to
 * BEST_DISPERSION is as consistent as a real strategy gets, and WORST_DISPERSION scores 0.
 */
const BEST_DISPERSION = 0.2;
const WORST_DISPERSION = 1;
/** Drawdown at which the drawdown score reaches 0 */
const RUINOUS_DRAWDOWN = 0.8;

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

  // ---- Absolute normalisation (0-100) ----

  const dispersionScore = clamp(
    (100 * (WORST_DISPERSION - dispersionRaw)) / (WORST_DISPERSION - BEST_DISPERSION),
    0,
    100,
  );
  const worstCaseScore = saturating(worstCaseRaw, WORST_CASE_RATE);
  const sharpeScore = saturating(sharpeRaw, SHARPE_RATE);
  // Quadratic: a 10% drawdown barely costs anything on a leveraged portfolio, while the
  // damage accelerates towards RUINOUS_DRAWDOWN (an 80% loss needs +400% to recover).
  const drawdownScore =
    100 * (1 - Math.pow(Math.min(drawdownRaw, RUINOUS_DRAWDOWN) / RUINOUS_DRAWDOWN, 2));

  // ---- Composite ----

  let composite = Math.pow(
    dispersionScore * worstCaseScore * sharpeScore * drawdownScore,
    1 / 4,
  );

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
