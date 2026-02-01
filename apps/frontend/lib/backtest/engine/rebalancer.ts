/**
 * Monthly rebalance + DCA logic
 * Handles deploy signals, contribution deployment, reborrow/sell, and position rebalancing
 */

import type { PortfolioState, RebalanceResult } from '../types';
import { calculateDeploySignals, type SignalParams } from './signals';

export interface RebalanceParams extends SignalParams {
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
}

/**
 * Perform monthly rebalance with optional DCA contribution
 */
export function rebalancePortfolio(
  state: PortfolioState,
  contribution: number,
  targetWeights: Record<string, number>,
  equityHistory: number[],
  currentPrices: Record<string, number>,
  params: RebalanceParams
): RebalanceResult {
  // 1. Calculate deploy signals
  const signals = calculateDeploySignals(
    state, equityHistory, targetWeights, params
  );

  // 2. Deploy fraction of contribution
  const deployed = contribution * signals.deployFraction;

  // 3. New equity after contribution deployment
  const newEquity = state.equity + deployed;

  // 4. Determine target exposure based on leverage bounds
  let targetExposure: number;
  const currentLeverage = newEquity > 0 ? state.exposure / newEquity : 0;

  if (currentLeverage < params.leverageMin) {
    // Leverage too low: reborrow to target
    targetExposure = newEquity * params.leverageTarget;
  } else if (currentLeverage > params.leverageMax) {
    // Leverage too high: sell down to max
    targetExposure = newEquity * params.leverageMax;
  } else {
    // In range: add deployed contribution to exposure
    targetExposure = state.exposure + deployed;
  }

  // 5. Calculate new borrowedAmount
  const newBorrowedAmount = targetExposure - newEquity;
  const borrowChange = newBorrowedAmount - state.borrowedAmount;

  // 6. Rebalance positions toward target weights
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

  return {
    newState,
    deployed,
    borrowChange,
    signals,
  };
}
