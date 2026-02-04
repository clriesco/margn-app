import { generateRollingWindows, alignPrices, runBacktest } from '../engine/backtest-engine';
import type { BacktestConfig, PriceData } from '../types';
import priceFixture from './fixtures/prices.json';

describe('backtest-engine', () => {
  describe('generateRollingWindows', () => {
    // Generate array of dates for testing (weekdays only, like stock market)
    function generateDates(startDate: string, count: number): string[] {
      const dates: string[] = [];
      const date = new Date(startDate + 'T12:00:00');
      while (dates.length < count) {
        const day = date.getDay();
        if (day !== 0 && day !== 6) { // Skip weekends
          dates.push(date.toISOString().slice(0, 10));
        }
        date.setDate(date.getDate() + 1);
      }
      return dates;
    }

    it('should generate windows for sufficient data', () => {
      // ~1 year of trading days, 6-month windows
      const dates = generateDates('2020-01-01', 252);
      const windows = generateRollingWindows(dates, 6);
      expect(windows.length).toBeGreaterThan(0);
    });

    it('should not exceed total days', () => {
      const dates = generateDates('2020-01-01', 150);
      const windows = generateRollingWindows(dates, 3);
      for (const w of windows) {
        expect(w.end).toBeLessThan(dates.length);
      }
    });

    it('should return empty for insufficient data', () => {
      const dates = generateDates('2020-01-01', 50);
      const windows = generateRollingWindows(dates, 12); // Need ~252 days for 12 months
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
