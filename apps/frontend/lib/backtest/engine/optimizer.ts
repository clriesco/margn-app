/**
 * Nelder-Mead portfolio optimization
 * Supports multiple objective functions: Sharpe, Sortino, Calmar, Ulcer (UPI)
 */

export type OptimizationObjective = 'sharpe' | 'sortino' | 'calmar' | 'ulcer';

export interface OptimizerConfig {
  leverage: number;
  riskFreeRate: number;
  minWeight: number;
  maxWeight: number;
  meanReturnShrinkage: number;
  yearlyTradingDays?: number;
  objective?: OptimizationObjective;
}

/**
 * Calculate leveraged Sharpe ratio for a set of weights
 */
export function calculateLeveragedSharpe(
  weights: number[],
  meanReturns: number[],
  covMatrix: number[][],
  leverage: number,
  yearlyTradingDays: number,
  riskFreeRate: number
): number {
  let portReturnDaily = 0;
  for (let i = 0; i < weights.length; i++) {
    portReturnDaily += weights[i] * meanReturns[i];
  }

  let portVarianceDaily = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      portVarianceDaily += weights[i] * weights[j] * covMatrix[i][j];
    }
  }

  const portReturnAnnual = portReturnDaily * yearlyTradingDays;
  const portVolAnnual = Math.sqrt(portVarianceDaily * yearlyTradingDays);

  const rLeveraged = portReturnAnnual * leverage;
  const volLeveraged = portVolAnnual * leverage;

  if (volLeveraged <= 0) return 0;
  return (rLeveraged - riskFreeRate) / volLeveraged;
}

/**
 * Calculate leveraged Sortino ratio
 * Only penalizes negative volatility (downside risk)
 */
function calculateLeveragedSortino(
  weights: number[],
  returnsMatrix: number[][],
  leverage: number,
  yearlyTradingDays: number,
  riskFreeRate: number
): number {
  const n = returnsMatrix[0].length;
  const portReturns: number[] = [];
  for (let t = 0; t < n; t++) {
    let r = 0;
    for (let i = 0; i < weights.length; i++) {
      r += weights[i] * returnsMatrix[i][t];
    }
    portReturns.push(r);
  }

  const meanReturn = portReturns.reduce((a, b) => a + b, 0) / n;
  const annualReturn = meanReturn * yearlyTradingDays * leverage;

  let sumSquaredDownside = 0;
  for (const r of portReturns) {
    if (r < 0) sumSquaredDownside += r * r;
  }
  const downsideDeviation =
    Math.sqrt(sumSquaredDownside / n) * Math.sqrt(yearlyTradingDays) * leverage;

  if (downsideDeviation <= 0) return 0;
  return (annualReturn - riskFreeRate) / downsideDeviation;
}

/**
 * Calculate leveraged Calmar ratio
 * CAGR / |MaxDrawdown| — directly penalizes max drawdown
 */
function calculateCalmarRatio(
  weights: number[],
  returnsMatrix: number[][],
  leverage: number,
  yearlyTradingDays: number,
): number {
  const n = returnsMatrix[0].length;
  let equity = 1.0;
  let peak = 1.0;
  let maxDrawdown = 0;

  for (let t = 0; t < n; t++) {
    let r = 0;
    for (let i = 0; i < weights.length; i++) {
      r += weights[i] * returnsMatrix[i][t];
    }
    equity *= 1 + r * leverage;
    if (equity <= 0) return -Infinity;
    if (equity > peak) peak = equity;
    const dd = (equity - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  if (equity <= 0) return -Infinity;
  const cagr = Math.pow(equity, yearlyTradingDays / n) - 1;
  const absMaxDD = Math.abs(maxDrawdown);

  if (absMaxDD <= 0) return cagr > 0 ? Infinity : 0;
  return cagr / absMaxDD;
}

/**
 * Calculate Ulcer Performance Index (UPI)
 * Penalizes both depth AND duration of drawdowns
 */
function calculateUlcerPerformanceIndex(
  weights: number[],
  returnsMatrix: number[][],
  leverage: number,
  yearlyTradingDays: number,
  riskFreeRate: number
): number {
  const n = returnsMatrix[0].length;
  let equity = 1.0;
  let peak = 1.0;
  let sumSquaredDD = 0;
  let meanReturn = 0;

  for (let t = 0; t < n; t++) {
    let r = 0;
    for (let i = 0; i < weights.length; i++) {
      r += weights[i] * returnsMatrix[i][t];
    }
    meanReturn += r;
    equity *= 1 + r * leverage;
    if (equity <= 0) return -Infinity;
    if (equity > peak) peak = equity;
    const ddPct = (equity - peak) / peak;
    sumSquaredDD += ddPct * ddPct;
  }

  meanReturn /= n;
  const annualReturn = meanReturn * yearlyTradingDays * leverage;
  const ulcerIndex = Math.sqrt(sumSquaredDD / n);

  if (ulcerIndex <= 0) return annualReturn > riskFreeRate ? Infinity : 0;
  return (annualReturn - riskFreeRate) / ulcerIndex;
}

/**
 * Calculate mean returns with shrinkage and covariance matrix from price series.
 * Also returns the aligned returns matrix for alternative objectives.
 */
export function calculateReturnsAndCovariance(
  pricesBySymbol: Record<string, number[]>,
  symbols: string[],
  shrinkage: number
): { meanReturns: number[]; covMatrix: number[][]; returnsMatrix: number[][]; minLength: number } {
  const returnsBySymbol: Record<string, number[]> = {};

  for (const symbol of symbols) {
    const prices = pricesBySymbol[symbol];
    const returns: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      if (prices[i - 1] > 0) {
        returns.push(Math.log(prices[i] / prices[i - 1]));
      }
    }
    returnsBySymbol[symbol] = returns;
  }

  const minLength = Math.min(
    ...symbols.map((s) => returnsBySymbol[s].length)
  );

  // Mean returns with shrinkage
  const meanReturns: number[] = [];
  for (const symbol of symbols) {
    const returns = returnsBySymbol[symbol].slice(-minLength);
    const rawMean = returns.reduce((a, b) => a + b, 0) / returns.length;
    meanReturns.push(rawMean * shrinkage);
  }

  // Build aligned returns matrix
  const returnsMatrix: number[][] = [];
  for (const symbol of symbols) {
    returnsMatrix.push(returnsBySymbol[symbol].slice(-minLength));
  }

  // Covariance matrix (no shrinkage)
  const n = symbols.length;
  const covMatrix: number[][] = [];
  for (let i = 0; i < n; i++) {
    covMatrix[i] = [];
    const returnsI = returnsBySymbol[symbols[i]].slice(-minLength);
    const meanI = returnsI.reduce((a, b) => a + b, 0) / returnsI.length;

    for (let j = 0; j < n; j++) {
      const returnsJ = returnsBySymbol[symbols[j]].slice(-minLength);
      const meanJ = returnsJ.reduce((a, b) => a + b, 0) / returnsJ.length;

      let cov = 0;
      for (let k = 0; k < minLength; k++) {
        cov += (returnsI[k] - meanI) * (returnsJ[k] - meanJ);
      }
      covMatrix[i][j] = cov / (minLength - 1);
    }
  }

  return { meanReturns, covMatrix, returnsMatrix, minLength };
}

/**
 * Nelder-Mead optimization for portfolio weights.
 * Maximizes the selected objective (Sharpe, Sortino, Calmar, or Ulcer).
 */
export function optimizeSharpeNelderMead(
  meanReturns: number[],
  covMatrix: number[][],
  config: OptimizerConfig,
  returnsMatrix?: number[][],
): number[] {
  const n = meanReturns.length;
  const { minWeight, maxWeight, leverage, riskFreeRate } = config;
  const yearlyTradingDays = config.yearlyTradingDays || 252;
  const objective = config.objective || 'sharpe';

  const negObjective = (weights: number[]): number => {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Infinity;
    const w = weights.map((x) => x / sum);

    for (const weight of w) {
      if (weight < minWeight - 0.001 || weight > maxWeight + 0.001) {
        return Infinity;
      }
    }

    if (returnsMatrix && objective !== 'sharpe') {
      switch (objective) {
        case 'sortino':
          return -calculateLeveragedSortino(w, returnsMatrix, leverage, yearlyTradingDays, riskFreeRate);
        case 'calmar':
          return -calculateCalmarRatio(w, returnsMatrix, leverage, yearlyTradingDays);
        case 'ulcer':
          return -calculateUlcerPerformanceIndex(w, returnsMatrix, leverage, yearlyTradingDays, riskFreeRate);
      }
    }

    return -calculateLeveragedSharpe(
      w, meanReturns, covMatrix, leverage, yearlyTradingDays, riskFreeRate
    );
  };

  // Initialize simplex with equal weights
  let bestWeights = Array(n).fill(1 / n);
  const simplex: { point: number[]; value: number }[] = [];
  simplex.push({ point: [...bestWeights], value: negObjective(bestWeights) });

  for (let i = 0; i < n; i++) {
    const point = [...bestWeights];
    point[i] = Math.min(maxWeight, point[i] + 0.05);
    const sum = point.reduce((a, b) => a + b, 0);
    for (let j = 0; j < n; j++) point[j] /= sum;
    simplex.push({ point, value: negObjective(point) });
  }

  simplex.sort((a, b) => a.value - b.value);

  // Nelder-Mead iterations
  const alpha = 1.0, gamma = 2.0, rho = 0.5, sigma = 0.5;
  const tolerance = 1e-8;
  const maxIterations = 500;

  for (let iter = 0; iter < maxIterations; iter++) {
    const range = simplex[n].value - simplex[0].value;
    if (range < tolerance) break;

    const centroid = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i].point[j] / n;
      }
    }

    const clampLo = Math.max(minWeight, 0);
    const reflected = centroid.map((c, j) => c + alpha * (c - simplex[n].point[j]));
    for (let j = 0; j < n; j++) reflected[j] = Math.max(clampLo, Math.min(0.99, reflected[j]));
    const reflectedValue = negObjective(reflected);

    if (reflectedValue < simplex[0].value) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      for (let j = 0; j < n; j++) expanded[j] = Math.max(clampLo, Math.min(0.99, expanded[j]));
      const expandedValue = negObjective(expanded);
      simplex[n] = expandedValue < reflectedValue
        ? { point: expanded, value: expandedValue }
        : { point: reflected, value: reflectedValue };
    } else if (reflectedValue < simplex[n - 1].value) {
      simplex[n] = { point: reflected, value: reflectedValue };
    } else {
      const contracted = centroid.map((c, j) => c + rho * (simplex[n].point[j] - c));
      const contractedValue = negObjective(contracted);
      if (contractedValue < simplex[n].value) {
        simplex[n] = { point: contracted, value: contractedValue };
      } else {
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i].point[j] = simplex[0].point[j] + sigma * (simplex[i].point[j] - simplex[0].point[j]);
          }
          simplex[i].value = negObjective(simplex[i].point);
        }
      }
    }

    simplex.sort((a, b) => a.value - b.value);
  }

  bestWeights = simplex[0].point;

  // Normalize
  let sum = bestWeights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    bestWeights = Array(n).fill(1 / n);
  } else {
    bestWeights = bestWeights.map((w) => w / sum);
  }

  // Apply min/max constraints with redistribution
  let needsAdjustment = true;
  let iterations = 0;
  while (needsAdjustment && iterations < 10) {
    needsAdjustment = false;
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

    if (excess !== 0) {
      const adjustable = bestWeights.filter((w) => w > minWeight && w < maxWeight).length;
      if (adjustable > 0) {
        const adjustment = excess / adjustable;
        for (let i = 0; i < n; i++) {
          if (bestWeights[i] > minWeight && bestWeights[i] < maxWeight) {
            bestWeights[i] -= adjustment;
          }
        }
      }
    }
    iterations++;
  }

  // Final normalization
  sum = bestWeights.reduce((a, b) => a + b, 0);
  return bestWeights.map((w) => w / sum);
}
