/**
 * Deploy signal calculations
 * Extracted from rebalance.service.ts as pure functions
 */

import type { PortfolioState, DeploySignals } from '../types';

export interface SignalParams {
  drawdownRedeployThreshold: number;
  weightDeviationThreshold: number;
  volatilityRedeployThreshold: number;
  volatilityLookbackDays: number;
  gradualDeployFactor: number;
  maintenanceMarginRatio: number;
}

/**
 * Calculate rolling annualized volatility from equity history
 */
export function calculateRollingVolatility(
  equityHistory: number[],
  lookbackDays: number
): number | null {
  const values = equityHistory.slice(-lookbackDays - 1);
  if (values.length < 2) return null;

  const logReturns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) {
      logReturns.push(Math.log(values[i] / values[i - 1]));
    }
  }

  if (logReturns.length === 0) return null;

  const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0)
    / (logReturns.length - 1 || 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

/**
 * Calculate max weight deviation between current and target weights
 */
export function calculateWeightDeviation(
  positions: Record<string, { value: number }>,
  exposure: number,
  targetWeights: Record<string, number>
): number {
  if (exposure <= 0) return 0;

  let maxDeviation = 0;
  for (const [symbol, targetWeight] of Object.entries(targetWeights)) {
    const currentValue = positions[symbol]?.value || 0;
    const currentWeight = currentValue / exposure;
    const deviation = Math.abs(currentWeight - targetWeight);
    if (deviation > maxDeviation) {
      maxDeviation = deviation;
    }
  }
  return maxDeviation;
}

/**
 * Calculate deploy signals given current portfolio state
 */
export function calculateDeploySignals(
  state: PortfolioState,
  equityHistory: number[],
  targetWeights: Record<string, number>,
  params: SignalParams
): DeploySignals {
  const drawdown = state.peakEquity > 0
    ? state.equity / state.peakEquity - 1
    : 0;

  const weightDeviation = calculateWeightDeviation(
    state.positions, state.exposure, targetWeights
  );

  const realizedVolatility = calculateRollingVolatility(
    equityHistory, params.volatilityLookbackDays
  );

  // Critical margin check: retain 100%
  if (state.marginRatio <= params.maintenanceMarginRatio * 2) {
    return {
      drawdownTriggered: false,
      weightDeviationTriggered: false,
      volatilityTriggered: false,
      deployFraction: 0,
      drawdown,
      weightDeviation,
      realizedVolatility,
    };
  }

  let deployFraction = 0;
  let drawdownTriggered = false;
  let weightDeviationTriggered = false;
  let volatilityTriggered = false;

  // Drawdown signal: full deploy
  if (drawdown <= -params.drawdownRedeployThreshold) {
    deployFraction = 1.0;
    drawdownTriggered = true;
  } else {
    // Weight deviation signal
    if (weightDeviation >= params.weightDeviationThreshold) {
      deployFraction = 1.0;
      weightDeviationTriggered = true;
    }
    // Low volatility signal
    if (realizedVolatility !== null && realizedVolatility <= params.volatilityRedeployThreshold) {
      deployFraction = 1.0;
      volatilityTriggered = true;
    }
  }

  // Apply gradual deploy factor
  if (deployFraction > 0) {
    deployFraction = Math.min(deployFraction, params.gradualDeployFactor);
  }

  return {
    drawdownTriggered,
    weightDeviationTriggered,
    volatilityTriggered,
    deployFraction,
    drawdown,
    weightDeviation,
    realizedVolatility,
  };
}
