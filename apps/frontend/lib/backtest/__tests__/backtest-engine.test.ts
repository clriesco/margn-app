import { generateRollingWindows, alignPrices, runBacktest } from '../engine/backtest-engine';
import type { BacktestConfig, PriceData } from '../types';
import priceFixture from './fixtures/prices.json';

describe('backtest-engine', () => {
  describe('generateRollingWindows', () => {
    it('should generate correct number of windows', () => {
      const windows = generateRollingWindows(252, 126, 21); // 1yr data, 6mo windows, 1mo step
      // (252 - 126) / 21 + 1 = 7
      expect(windows.length).toBe(7);
    });

    it('should not exceed total days', () => {
      const windows = generateRollingWindows(100, 60, 21);
      for (const w of windows) {
        expect(w.end).toBeLessThan(100);
      }
    });

    it('should return empty for insufficient data', () => {
      const windows = generateRollingWindows(50, 252, 21);
      expect(windows.length).toBe(0);
    });
  });

  describe('alignPrices', () => {
    it('should find common dates across symbols', () => {
      const priceData: PriceData = {
        A: { '2020-01-02': 100, '2020-01-03': 101, '2020-01-06': 102 },
        B: { '2020-01-02': 50, '2020-01-03': 51 },
      };

      const { prices, dates } = alignPrices(priceData, ['A', 'B']);

      expect(dates).toEqual(['2020-01-02', '2020-01-03']); // Only common dates
      expect(prices.A).toEqual([100, 101]);
      expect(prices.B).toEqual([50, 51]);
    });
  });

  describe('runBacktest', () => {
    // Use fixture prices but they're only 30 days, so use small window
    const config: BacktestConfig = {
      symbols: ['SPY', 'TLT'],
      initialCapital: 10000,
      monthlyContribution: 500,
      leverageMin: 2.5,
      leverageMax: 4.0,
      leverageTarget: 3.0,
      startDate: '2020-01-02',
      endDate: '2020-02-14',
      windowMonths: 1, // 21 trading days
      weightMode: 'equal',
      drawdownRedeployThreshold: 0.12,
      weightDeviationThreshold: 0.05,
      volatilityRedeployThreshold: 0.18,
      volatilityLookbackDays: 63,
      gradualDeployFactor: 0.5,
      meanReturnShrinkage: 0.6,
      riskFreeRate: 0.02,
      maintenanceMarginRatio: 0.05,
      maxWeight: 0.4,
      minWeight: 0.05,
    };

    it('should run without errors', () => {
      const result = runBacktest(config, priceFixture as PriceData);

      expect(result.totalWindows).toBeGreaterThan(0);
      expect(result.marginCallCount).toBe(0);
      expect(result.p50).toBeDefined();
      expect(result.p50.finalCapital).toBeGreaterThan(0);
    });

    it('should report progress', () => {
      const progressCalls: number[] = [];
      runBacktest(config, priceFixture as PriceData, (p) => {
        progressCalls.push(p.percent);
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });

    it('should use equal weights when specified', () => {
      const result = runBacktest(config, priceFixture as PriceData);
      expect(result.weightsUsed.SPY).toBeCloseTo(0.5);
      expect(result.weightsUsed.TLT).toBeCloseTo(0.5);
    });

    it('should throw for insufficient data', () => {
      const badConfig = { ...config, windowMonths: 60 }; // Need 1260 days, have 30
      expect(() => runBacktest(badConfig, priceFixture as PriceData)).toThrow();
    });
  });
});
