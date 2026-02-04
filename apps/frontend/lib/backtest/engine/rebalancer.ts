/**
 * Monthly rebalance + DCA logic
 * Simplified: contribution always goes to equity, only reborrow when leverage < min
 */

import type { PortfolioState, RebalanceResult, DeploySignals } from '../types';

export interface RebalanceParams {
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
  maintenanceMarginRatio: number;
}

/**
 * Perform monthly rebalance with DCA contribution
 *
 * Logic:
 * 1. Add full contribution to equity
 * 2. If leverage < min → reborrow to target (increase exposure)
 * 3. If leverage >= min → keep exposure constant (contribution reduces leverage)
 * 4. Rebalance positions toward target weights
 */
export function rebalancePortfolio(
  state: PortfolioState,
  contribution: number,
  targetWeights: Record<string, number>,
  _equityHistory: number[], // kept for API compatibility
  currentPrices: Record<string, number>,
  params: RebalanceParams
): RebalanceResult {
  // 1. Add full contribution to equity
  const newEquity = state.equity + contribution;

  // 2. Calculate current leverage after contribution
  const currentLeverage = newEquity > 0 ? state.exposure / newEquity : 0;

  // 3. Determine target exposure
  let targetExposure: number;
  let reborrowed = false;

  if (currentLeverage < params.leverageMin) {
    // Leverage too low (market went up): reborrow to target
    targetExposure = newEquity * params.leverageTarget;
    reborrowed = true;
  } else {
    // Leverage in range or above: keep exposure constant
    // Contribution just reduces leverage (acts as buffer)
    targetExposure = state.exposure;
  }

  // 4. Calculate new borrowedAmount
  const newBorrowedAmount = targetExposure - newEquity;
  const borrowChange = newBorrowedAmount - state.borrowedAmount;

  // 5. Rebalance positions toward target weights
  const newPositions: Record<string, { quantity: number; value: number }> = {};
  for (const [symbol, weight] of Object.entries(targetWeights)) {
    const targetValue = targetExposure * weight;
    const price = currentPrices[symbol] || 0;
    const quantity = price > 0 ? targetValue / price : 0;
    newPositions[symbol] = { quantity, value: targetValue };
  }

  const newLeverage = newEquity > 0 ? targetExposure / newEquity : 0;
  const newMarginRatio = targetExposure > 0 ? newEquity / targetExposure : 1;

  const newState: PortfolioState = {
    day: state.day,
    date: state.date,
    equity: newEquity,
    exposure: targetExposure,
    leverage: newLeverage,
    borrowedAmount: newBorrowedAmount,
    positions: newPositions,
    peakEquity: Math.max(state.peakEquity, newEquity),
    marginRatio: newMarginRatio,
    marginCall: newMarginRatio <= params.maintenanceMarginRatio,
  };

  // Simplified signals (for compatibility)
  const signals: DeploySignals = {
    drawdownTriggered: false,
    weightDeviationTriggered: false,
    volatilityTriggered: false,
    deployFraction: 1.0, // Always deploy full contribution
    drawdown: state.peakEquity > 0 ? state.equity / state.peakEquity - 1 : 0,
    weightDeviation: 0,
    realizedVolatility: null,
  };

  return {
    newState,
    deployed: contribution,
    borrowChange,
    signals,
    reborrowed,
  };
}
