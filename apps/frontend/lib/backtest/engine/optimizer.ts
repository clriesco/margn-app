/**
 * Nelder-Mead Sharpe optimization
 * Extracted from rebalance.service.ts as pure functions (no Prisma, no async)
 */

export interface OptimizerConfig {
  leverage: number;
  riskFreeRate: number;
  minWeight: number;
  maxWeight: number;
  meanReturnShrinkage: number;
  yearlyTradingDays?: number;
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
 * Calculate mean returns with shrinkage and covariance matrix from price series
 */
export function calculateReturnsAndCovariance(
  pricesBySymbol: Record<string, number[]>,
  symbols: string[],
  shrinkage: number
): { meanReturns: number[]; covMatrix: number[][]; minLength: number } {
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

  return { meanReturns, covMatrix, minLength };
}

/**
 * Nelder-Mead optimization for Sharpe-maximizing weights
 */
export function optimizeSharpeNelderMead(
  meanReturns: number[],
  covMatrix: number[][],
  config: OptimizerConfig
): number[] {
  const n = meanReturns.length;
  const { minWeight, maxWeight, leverage, riskFreeRate } = config;
  const yearlyTradingDays = config.yearlyTradingDays || 252;

  const negSharpe = (weights: number[]): number => {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Infinity;
    const w = weights.map((x) => x / sum);

    for (const weight of w) {
      if (weight < minWeight - 0.001 || weight > maxWeight + 0.001) {
        return Infinity;
      }
    }

    return -calculateLeveragedSharpe(
      w, meanReturns, covMatrix, leverage, yearlyTradingDays, riskFreeRate
    );
  };

  // Initialize simplex with equal weights
  let bestWeights = Array(n).fill(1 / n);
  const simplex: { point: number[]; value: number }[] = [];
  simplex.push({ point: [...bestWeights], value: negSharpe(bestWeights) });

  for (let i = 0; i < n; i++) {
    const point = [...bestWeights];
    point[i] = Math.min(maxWeight, point[i] + 0.05);
    const sum = point.reduce((a, b) => a + b, 0);
    for (let j = 0; j < n; j++) point[j] /= sum;
    simplex.push({ point, value: negSharpe(point) });
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

    const reflected = centroid.map((c, j) => c + alpha * (c - simplex[n].point[j]));
    for (let j = 0; j < n; j++) reflected[j] = Math.max(0.01, Math.min(0.99, reflected[j]));
    const reflectedValue = negSharpe(reflected);

    if (reflectedValue < simplex[0].value) {
      const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
      for (let j = 0; j < n; j++) expanded[j] = Math.max(0.01, Math.min(0.99, expanded[j]));
      const expandedValue = negSharpe(expanded);
      simplex[n] = expandedValue < reflectedValue
        ? { point: expanded, value: expandedValue }
        : { point: reflected, value: reflectedValue };
    } else if (reflectedValue < simplex[n - 1].value) {
      simplex[n] = { point: reflected, value: reflectedValue };
    } else {
      const contracted = centroid.map((c, j) => c + rho * (simplex[n].point[j] - c));
      const contractedValue = negSharpe(contracted);
      if (contractedValue < simplex[n].value) {
        simplex[n] = { point: contracted, value: contractedValue };
      } else {
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i].point[j] = simplex[0].point[j] + sigma * (simplex[i].point[j] - simplex[0].point[j]);
          }
          simplex[i].value = negSharpe(simplex[i].point);
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
