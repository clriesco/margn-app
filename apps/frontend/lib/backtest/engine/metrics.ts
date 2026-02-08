/**
 * Backtest metrics calculations
 * CAGR, Sharpe, drawdown, recovery, margin call detection
 */

import type { PortfolioState, WindowMetrics } from '../types';

/**
 * Calculate all metrics for a single backtest window
 * @param contributionIndices - Array of state indices where each contribution was deployed
 */
export function calculateWindowMetrics(
  states: PortfolioState[],
  totalContributed: number,
  riskFreeRate: number,
  windowIndex: number,
  startDate: string,
  endDate: string,
  contributions: number[] = [],
  contributionIndices: number[] = []
): WindowMetrics {
  if (states.length === 0) {
    return emptyMetrics(windowIndex, startDate, endDate);
  }

  const firstEquity = states[0].equity;
  const lastState = states[states.length - 1];

  // Check for margin call - if so, return catastrophic metrics
  const marginCall = states.some((s) => s.marginCall);

  if (marginCall) {
    const totalInvested = firstEquity + totalContributed;
    return {
      windowIndex,
      startDate,
      endDate,
      finalCapital: 0,
      totalContributed,
      absoluteReturn: -totalInvested,
      returnPercent: -1, // -100%
      cagr: -1, // -100%
      xirr: null,
      sharpe: -Infinity,
      maxDrawdownEquity: -1, // -100%
      recoveryDays: states.length,
      underwaterDays: states.length,
      marginCall: true,
      finalLeverage: 0,
    };
  }

  const finalCapital = lastState.equity;
  const absoluteReturn = finalCapital - totalContributed - firstEquity;
  const totalInvested = firstEquity + totalContributed;
  const returnPercent = totalInvested > 0 ? absoluteReturn / totalInvested : 0;

  // CAGR
  const years = states.length / 252;
  const cagr = years > 0 && firstEquity > 0
    ? Math.pow(finalCapital / firstEquity, 1 / years) - 1
    : 0;

  // Daily returns (excluding contribution days to avoid spikes)
  const dailyReturns: number[] = [];
  for (let i = 1; i < states.length; i++) {
    if (states[i - 1].equity > 0) {
      dailyReturns.push(states[i].equity / states[i - 1].equity - 1);
    }
  }

  // Sharpe
  const sharpe = calculateSharpe(dailyReturns, riskFreeRate);

  // Max drawdown and recovery
  let maxDrawdown = 0;
  let peakEquity = states[0].equity;
  let maxRecoveryDays = 0;
  let currentRecovery = 0;
  let underwaterDays = 0;

  // Pre-compute cumulative contributions for underwater calculation
  const cumulativeContribs: number[] = [0];
  for (let i = 0; i < contributions.length; i++) {
    cumulativeContribs.push(cumulativeContribs[i] + contributions[i]);
  }

  for (let i = 0; i < states.length; i++) {
    const state = states[i];

    if (state.equity > peakEquity) {
      peakEquity = state.equity;
      currentRecovery = 0;
    } else {
      const dd = state.equity / peakEquity - 1;
      if (dd < maxDrawdown) maxDrawdown = dd;
      currentRecovery++;
      if (currentRecovery > maxRecoveryDays) {
        maxRecoveryDays = currentRecovery;
      }
    }

    // Calculate total invested up to this day using exact contribution indices
    // contributionIndices[k] is the state index where contribution[k] was deployed
    let numContribsDeployed = 0;
    for (let k = 0; k < contributionIndices.length; k++) {
      if (i >= contributionIndices[k]) {
        numContribsDeployed = k + 1;
      } else {
        break;
      }
    }
    const investedSoFar = firstEquity + cumulativeContribs[numContribsDeployed];

    if (state.equity < investedSoFar) {
      underwaterDays++;
    }
  }

  // XIRR — accounts for DCA timing
  const cashFlows: { amount: number; date: string }[] = [
    { amount: -firstEquity, date: states[0].date },
  ];
  for (let k = 0; k < contributions.length; k++) {
    if (contributionIndices[k] < states.length) {
      cashFlows.push({
        amount: -contributions[k],
        date: states[contributionIndices[k]].date,
      });
    }
  }
  cashFlows.push({ amount: finalCapital, date: states[states.length - 1].date });
  const xirr = calculateXIRR(cashFlows);

  return {
    windowIndex,
    startDate,
    endDate,
    finalCapital,
    totalContributed,
    absoluteReturn,
    returnPercent,
    cagr,
    xirr,
    sharpe,
    maxDrawdownEquity: maxDrawdown,
    recoveryDays: maxRecoveryDays,
    underwaterDays,
    marginCall: false,
    finalLeverage: lastState.leverage,
  };
}

/**
 * Calculate XIRR (Extended Internal Rate of Return) using Newton-Raphson.
 * Accounts for the timing of DCA contributions, unlike CAGR.
 */
export function calculateXIRR(
  cashFlows: { amount: number; date: string }[]
): number | null {
  if (cashFlows.length < 2) return null;

  const d0 = new Date(cashFlows[0].date).getTime();
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = cashFlows.map(
    (cf) => (new Date(cf.date).getTime() - d0) / msPerYear
  );
  const amounts = cashFlows.map((cf) => cf.amount);

  let rate = 0.1; // initial guess

  for (let iter = 0; iter < 100; iter++) {
    let f = 0;
    let df = 0;

    for (let j = 0; j < amounts.length; j++) {
      const t = years[j];
      const base = 1 + rate;
      if (base <= 0) {
        rate = 0.01;
        break;
      }
      const pv = amounts[j] / Math.pow(base, t);
      f += pv;
      if (t !== 0) {
        df -= (t * amounts[j]) / Math.pow(base, t + 1);
      }
    }

    if (Math.abs(df) < 1e-12) return null;

    const newRate = rate - f / df;

    if (Math.abs(newRate - rate) < 1e-7) {
      if (newRate < -0.99 || newRate > 10) return null;
      return newRate;
    }

    rate = newRate;
    if (rate < -0.99) rate = -0.99;
    if (rate > 10) rate = 10;
  }

  return null; // didn't converge
}

/**
 * Calculate annualized Sharpe ratio from daily returns
 */
export function calculateSharpe(
  dailyReturns: number[],
  riskFreeRate: number
): number {
  if (dailyReturns.length < 2) return 0;

  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0)
    / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);

  if (stdDev <= 0) return 0;

  const annualizedReturn = mean * 252;
  const annualizedVol = stdDev * Math.sqrt(252);

  return (annualizedReturn - riskFreeRate) / annualizedVol;
}

/**
 * Select percentile window by Sharpe rank
 */
export function selectPercentileWindow(
  windows: WindowMetrics[],
  percentile: number
): WindowMetrics {
  const sorted = [...windows].sort((a, b) => a.sharpe - b.sharpe);
  const idx = Math.min(
    Math.floor(sorted.length * percentile),
    sorted.length - 1
  );
  return sorted[idx];
}

function emptyMetrics(windowIndex: number, startDate: string, endDate: string): WindowMetrics {
  return {
    windowIndex, startDate, endDate,
    finalCapital: 0, totalContributed: 0, absoluteReturn: 0,
    returnPercent: 0, cagr: 0, xirr: null, sharpe: 0, maxDrawdownEquity: 0,
    recoveryDays: 0, underwaterDays: 0, marginCall: false, finalLeverage: 0,
  };
}
