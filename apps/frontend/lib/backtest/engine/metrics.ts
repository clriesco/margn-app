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

  return {
    windowIndex,
    startDate,
    endDate,
    finalCapital,
    totalContributed,
    absoluteReturn,
    returnPercent,
    cagr,
    sharpe,
    maxDrawdownEquity: maxDrawdown,
    recoveryDays: maxRecoveryDays,
    underwaterDays,
    marginCall: false,
    finalLeverage: lastState.leverage,
  };
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
    returnPercent: 0, cagr: 0, sharpe: 0, maxDrawdownEquity: 0,
    recoveryDays: 0, underwaterDays: 0, marginCall: false, finalLeverage: 0,
  };
}
