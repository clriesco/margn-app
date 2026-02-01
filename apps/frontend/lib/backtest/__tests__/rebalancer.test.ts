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
  // Use high-volatility equity history to avoid triggering low-vol signal
  const equityHistory: number[] = [10000];
  for (let i = 1; i < 100; i++) {
    equityHistory.push(equityHistory[i - 1] * (1 + (i % 2 === 0 ? 0.03 : -0.03)));
  }

  const params = {
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    drawdownRedeployThreshold: 0.12,
    weightDeviationThreshold: 0.05,
    volatilityRedeployThreshold: 0.18,
    volatilityLookbackDays: 63,
    gradualDeployFactor: 0.5,
    maintenanceMarginRatio: 0.05,
  };

  it('should not deploy when no signals trigger', () => {
    const result = rebalancePortfolio(
      baseState, 2000, targetWeights, equityHistory, currentPrices, params
    );

    // No signals → deployFraction = 0 → deployed = 0
    expect(result.deployed).toBe(0);
    // Equity unchanged (no contribution deployed)
    expect(result.newState.equity).toBe(10000);
  });

  it('should deploy when drawdown triggered', () => {
    const drawdownState = {
      ...baseState,
      equity: 8500, // 15% drawdown
      peakEquity: 10000,
    };

    const result = rebalancePortfolio(
      drawdownState, 2000, targetWeights, equityHistory, currentPrices, params
    );

    expect(result.signals.drawdownTriggered).toBe(true);
    expect(result.deployed).toBe(1000); // 2000 * 0.5 (gradual factor)
    expect(result.newState.equity).toBe(9500); // 8500 + 1000
  });

  it('should reborrow when leverage is below min', () => {
    const lowLevState = {
      ...baseState,
      equity: 15000,
      exposure: 30000,
      leverage: 2.0, // Below leverageMin 2.5
    };

    const result = rebalancePortfolio(
      lowLevState, 0, targetWeights, equityHistory, currentPrices, params
    );

    // Should target leverageTarget * equity
    expect(result.newState.exposure).toBe(15000 * 3.0);
    expect(result.newState.leverage).toBeCloseTo(3.0);
  });

  it('should sell down when leverage exceeds max', () => {
    const highLevState = {
      ...baseState,
      equity: 6000,
      exposure: 30000,
      leverage: 5.0, // Above leverageMax 4.0
      marginRatio: 0.2,
    };

    const result = rebalancePortfolio(
      highLevState, 0, targetWeights, equityHistory, currentPrices, params
    );

    // Should target leverageMax * equity
    expect(result.newState.exposure).toBe(6000 * 4.0);
    expect(result.newState.leverage).toBeCloseTo(4.0);
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
