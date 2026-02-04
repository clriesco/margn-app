/**
 * Portfolio daily simulation
 * Applies daily returns to positions, updates equity/exposure/leverage
 */

import type { PortfolioState, DailyReturn } from '../types';

/**
 * Simulate one day: apply returns to all positions
 */
export function simulateDay(
  state: PortfolioState,
  returns: DailyReturn,
  date: string,
  maintenanceMarginRatio: number
): PortfolioState {
  const newPositions: Record<string, { quantity: number; value: number }> = {};
  let newExposure = 0;

  for (const [symbol, pos] of Object.entries(state.positions)) {
    const ret = returns[symbol] ?? 0;
    const newValue = pos.value * (1 + ret);
    newPositions[symbol] = { quantity: pos.quantity, value: newValue };
    newExposure += newValue;
  }

  // Equity = exposure - borrowedAmount (borrowedAmount stays constant between rebalances)
  const newEquity = newExposure - state.borrowedAmount;
  const newPeakEquity = Math.max(state.peakEquity, newEquity);
  const newLeverage = newEquity > 0 ? newExposure / newEquity : 0;
  const newMarginRatio = newExposure > 0 ? newEquity / newExposure : 1;
  const marginCall = newMarginRatio <= maintenanceMarginRatio;

  // If margin call, portfolio is liquidated - equity goes to 0
  if (marginCall) {
    return {
      day: state.day + 1,
      date,
      equity: 0,
      exposure: 0,
      leverage: 0,
      borrowedAmount: 0,
      positions: {},
      peakEquity: newPeakEquity,
      marginRatio: 0,
      marginCall: true,
    };
  }

  return {
    day: state.day + 1,
    date,
    equity: newEquity,
    exposure: newExposure,
    leverage: newLeverage,
    borrowedAmount: state.borrowedAmount,
    positions: newPositions,
    peakEquity: newPeakEquity,
    marginRatio: newMarginRatio,
    marginCall: false,
  };
}

/**
 * Simulate multiple days from price data
 * prices: symbol -> array of prices (aligned by index)
 * dates: array of date strings (aligned by index)
 * startIdx: index to start from (day 0 uses startIdx prices for initial state)
 * numDays: number of trading days to simulate
 */
export function simulatePortfolioDays(
  initialState: PortfolioState,
  symbols: string[],
  prices: Record<string, number[]>,
  dates: string[],
  startIdx: number,
  numDays: number,
  maintenanceMarginRatio: number
): PortfolioState[] {
  const states: PortfolioState[] = [initialState];
  let current = initialState;

  for (let d = 1; d <= numDays && startIdx + d < dates.length; d++) {
    const returns: DailyReturn = {};
    for (const symbol of symbols) {
      const prev = prices[symbol][startIdx + d - 1];
      const curr = prices[symbol][startIdx + d];
      returns[symbol] = prev > 0 ? curr / prev - 1 : 0;
    }
    current = simulateDay(current, returns, dates[startIdx + d], maintenanceMarginRatio);
    states.push(current);

    if (current.marginCall) break;
  }

  return states;
}

/**
 * Create initial portfolio state from capital, weights, prices, and leverage
 */
export function createInitialState(
  initialCapital: number,
  leverageTarget: number,
  weights: Record<string, number>,
  prices: Record<string, number>,
  date: string
): PortfolioState {
  const totalExposure = initialCapital * leverageTarget;
  const borrowedAmount = totalExposure - initialCapital;
  const positions: Record<string, { quantity: number; value: number }> = {};

  for (const [symbol, weight] of Object.entries(weights)) {
    const value = totalExposure * weight;
    const price = prices[symbol];
    const quantity = price > 0 ? value / price : 0;
    positions[symbol] = { quantity, value };
  }

  return {
    day: 0,
    date,
    equity: initialCapital,
    exposure: totalExposure,
    leverage: leverageTarget,
    borrowedAmount,
    positions,
    peakEquity: initialCapital,
    marginRatio: initialCapital / totalExposure,
    marginCall: false,
  };
}
