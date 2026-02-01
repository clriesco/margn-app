import {
  calculateRollingVolatility,
  calculateWeightDeviation,
  calculateDeploySignals,
} from '../engine/signals';
import type { PortfolioState } from '../types';

describe('signals', () => {
  describe('calculateRollingVolatility', () => {
    it('should return null for insufficient data', () => {
      expect(calculateRollingVolatility([100], 63)).toBeNull();
    });

    it('should return 0 for constant equity', () => {
      const equity = Array(100).fill(10000);
      const vol = calculateRollingVolatility(equity, 63);
      expect(vol).toBe(0);
    });

    it('should return positive volatility for varying equity', () => {
      // Simulate some equity fluctuation
      const equity: number[] = [10000];
      for (let i = 1; i < 100; i++) {
        equity.push(equity[i - 1] * (1 + (Math.random() - 0.5) * 0.02));
      }
      const vol = calculateRollingVolatility(equity, 63);
      expect(vol).not.toBeNull();
      expect(vol!).toBeGreaterThan(0);
    });
  });

  describe('calculateWeightDeviation', () => {
    it('should return 0 when weights match', () => {
      const positions = { SPY: { value: 6000 }, TLT: { value: 4000 } };
      const targets = { SPY: 0.6, TLT: 0.4 };
      expect(calculateWeightDeviation(positions, 10000, targets)).toBeCloseTo(0, 4);
    });

    it('should return correct deviation', () => {
      const positions = { SPY: { value: 7000 }, TLT: { value: 3000 } };
      const targets = { SPY: 0.6, TLT: 0.4 };
      // SPY: 0.7 vs 0.6 = 0.1, TLT: 0.3 vs 0.4 = 0.1
      expect(calculateWeightDeviation(positions, 10000, targets)).toBeCloseTo(0.1, 4);
    });

    it('should return 0 for zero exposure', () => {
      expect(calculateWeightDeviation({}, 0, { SPY: 0.6 })).toBe(0);
    });
  });

  describe('calculateDeploySignals', () => {
    const baseState: PortfolioState = {
      day: 100, date: '2020-06-01',
      equity: 10000, exposure: 30000, leverage: 3.0,
      borrowedAmount: 20000, positions: { SPY: { quantity: 50, value: 18000 }, TLT: { quantity: 100, value: 12000 } },
      peakEquity: 10000, marginRatio: 0.333, marginCall: false,
    };

    const params = {
      drawdownRedeployThreshold: 0.12,
      weightDeviationThreshold: 0.05,
      volatilityRedeployThreshold: 0.18,
      volatilityLookbackDays: 63,
      gradualDeployFactor: 0.5,
      maintenanceMarginRatio: 0.05,
    };

    it('should not trigger any signal when at peak with high volatility', () => {
      // Use high-volatility equity history so vol signal doesn't trigger
      const equityHistory: number[] = [10000];
      for (let i = 1; i < 100; i++) {
        equityHistory.push(equityHistory[i - 1] * (1 + (i % 2 === 0 ? 0.03 : -0.03)));
      }
      const targets = { SPY: 0.6, TLT: 0.4 };
      const signals = calculateDeploySignals(baseState, equityHistory, targets, params);

      expect(signals.drawdownTriggered).toBe(false);
      // Weight deviation: SPY 18k/30k=0.6 vs 0.6 → no trigger
      expect(signals.deployFraction).toBe(0);
    });

    it('should trigger drawdown when equity drops >12%', () => {
      const stateWithDrawdown = {
        ...baseState,
        equity: 8500, // 15% drawdown from peak 10000
        peakEquity: 10000,
      };
      const equityHistory = Array(100).fill(10000);
      const targets = { SPY: 0.6, TLT: 0.4 };
      const signals = calculateDeploySignals(stateWithDrawdown, equityHistory, targets, params);

      expect(signals.drawdownTriggered).toBe(true);
      expect(signals.deployFraction).toBe(0.5); // capped by gradualDeployFactor
    });

    it('should deploy 0 when margin is critical', () => {
      const criticalState = {
        ...baseState,
        marginRatio: 0.08, // below 2 * 0.05 = 0.1
      };
      const equityHistory = Array(100).fill(10000);
      const targets = { SPY: 0.6, TLT: 0.4 };
      const signals = calculateDeploySignals(criticalState, equityHistory, targets, params);

      expect(signals.deployFraction).toBe(0);
    });
  });
});
