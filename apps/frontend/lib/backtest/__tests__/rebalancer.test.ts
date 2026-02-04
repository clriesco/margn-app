import { rebalancePortfolio } from '../engine/rebalancer';
import type { PortfolioState } from '../types';

describe('rebalancer', () => {
  const baseState: PortfolioState = {
    day: 21, date: '2020-02-01',
    equity: 10000, exposure: 30000, leverage: 3.0,
    borrowedAmount: 20000,
    positions: {
      SPY: { quantity: 60, value: 18000 },
      TLT: { quantity: 85.714, value: 12000 },
    },
    peakEquity: 10000, marginRatio: 1 / 3, marginCall: false,
  };

  const targetWeights = { SPY: 0.6, TLT: 0.4 };
  const currentPrices = { SPY: 300, TLT: 140 };
  const equityHistory: number[] = [10000];

  const params = {
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    maintenanceMarginRatio: 0.05,
  };

  it('should add full contribution to equity when leverage in range', () => {
    const result = rebalancePortfolio(
      baseState, 2000, targetWeights, equityHistory, currentPrices, params
    );

    // Full contribution goes to equity
    expect(result.deployed).toBe(2000);
    expect(result.newState.equity).toBe(12000);
    // Exposure stays constant (no reborrow needed)
    expect(result.newState.exposure).toBe(30000);
    // Leverage decreases
    expect(result.newState.leverage).toBeCloseTo(2.5);
  });

  it('should reborrow when leverage drops below min', () => {
    const lowLevState = {
      ...baseState,
      equity: 15000,
      exposure: 30000,
      leverage: 2.0, // Below leverageMin 2.5
      borrowedAmount: 15000,
    };

    const result = rebalancePortfolio(
      lowLevState, 1000, targetWeights, equityHistory, currentPrices, params
    );

    // Contribution added to equity
    expect(result.newState.equity).toBe(16000);
    // Should reborrow to target leverage
    expect(result.newState.exposure).toBe(16000 * 3.0);
    expect(result.newState.leverage).toBeCloseTo(3.0);
    expect(result.reborrowed).toBe(true);
  });

  it('should keep exposure constant when leverage above min', () => {
    const highLevState = {
      ...baseState,
      equity: 6000,
      exposure: 30000,
      leverage: 5.0, // Above leverageMax 4.0
      borrowedAmount: 24000,
      marginRatio: 0.2,
    };

    const result = rebalancePortfolio(
      highLevState, 2000, targetWeights, equityHistory, currentPrices, params
    );

    // Contribution goes to equity
    expect(result.newState.equity).toBe(8000);
    // Exposure stays constant (contribution reduces leverage)
    expect(result.newState.exposure).toBe(30000);
    // Leverage reduced but still high
    expect(result.newState.leverage).toBeCloseTo(3.75);
  });

  it('should rebalance positions toward target weights', () => {
    const result = rebalancePortfolio(
      baseState, 0, targetWeights, equityHistory, currentPrices, params
    );

    const spyWeight = result.newState.positions.SPY.value / result.newState.exposure;
    const tltWeight = result.newState.positions.TLT.value / result.newState.exposure;

    expect(spyWeight).toBeCloseTo(0.6, 2);
    expect(tltWeight).toBeCloseTo(0.4, 2);
  });
});
