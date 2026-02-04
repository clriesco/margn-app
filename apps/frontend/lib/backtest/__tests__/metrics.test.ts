import { calculateWindowMetrics, calculateSharpe, selectPercentileWindow } from '../engine/metrics';
import type { PortfolioState, WindowMetrics } from '../types';

describe('metrics', () => {
  function makeState(day: number, equity: number): PortfolioState {
    return {
      day, date: `2020-01-${String(day + 1).padStart(2, '0')}`,
      equity, exposure: equity * 3, leverage: 3,
      borrowedAmount: equity * 2,
      positions: { SPY: { quantity: 10, value: equity * 3 } },
      peakEquity: equity, marginRatio: 1 / 3, marginCall: false,
    };
  }

  describe('calculateSharpe', () => {
    it('should return 0 for insufficient data', () => {
      expect(calculateSharpe([0.01], 0.02)).toBe(0);
    });

    it('should return positive for consistently positive returns', () => {
      const returns = Array(252).fill(0.001);
      expect(calculateSharpe(returns, 0.02)).toBeGreaterThan(0);
    });

    it('should return negative for consistently negative returns', () => {
      const returns = Array(252).fill(-0.001);
      expect(calculateSharpe(returns, 0.02)).toBeLessThan(0);
    });
  });

  describe('calculateWindowMetrics', () => {
    it('should compute metrics for steady growth', () => {
      // 252 days of ~0.04% daily growth with slight noise for non-zero Sharpe
      const states: PortfolioState[] = [];
      let equity = 10000;
      for (let d = 0; d < 252; d++) {
        states.push(makeState(d, equity));
        equity *= 1.0004 + (d % 3 === 0 ? 0.0001 : -0.00005);
      }

      const metrics = calculateWindowMetrics(states, 0, 0.02, 0, '2020-01-01', '2020-12-31');

      expect(metrics.finalCapital).toBeGreaterThan(10000);
      expect(metrics.cagr).toBeGreaterThan(0);
      expect(metrics.sharpe).toBeGreaterThan(0);
      expect(metrics.maxDrawdownEquity).toBeLessThanOrEqual(0);
      expect(metrics.marginCall).toBe(false);
    });

    it('should detect drawdown', () => {
      const states = [
        makeState(0, 10000),
        makeState(1, 10500),
        makeState(2, 9000), // Drawdown from peak 10500
        makeState(3, 9500),
      ];
      // Fix peakEquity tracking
      states[1] = { ...states[1], peakEquity: 10500 };
      states[2] = { ...states[2], peakEquity: 10500 };
      states[3] = { ...states[3], peakEquity: 10500 };

      const metrics = calculateWindowMetrics(states, 0, 0.02, 0, '2020-01-01', '2020-01-04');

      expect(metrics.maxDrawdownEquity).toBeLessThan(0);
      expect(metrics.recoveryDays).toBeGreaterThan(0);
    });

    it('should detect margin call', () => {
      const states = [
        makeState(0, 10000),
        { ...makeState(1, 500), marginCall: true },
      ];

      const metrics = calculateWindowMetrics(states, 0, 0.02, 0, '2020-01-01', '2020-01-02');
      expect(metrics.marginCall).toBe(true);
    });

    it('should calculate underwaterDays correctly with progressive contributions', () => {
      // Simulate 63 days (3 months): equity starts at 10000, grows to 12000
      // Contributions: 500 at state index 21, 500 at state index 42
      const states: PortfolioState[] = [];
      for (let d = 0; d < 63; d++) {
        // Equity grows linearly from 10000 to 12000 over 63 days
        const equity = 10000 + (2000 * d / 62);
        states.push(makeState(d, equity));
      }

      const contributions = [500, 500];
      const contributionIndices = [21, 42]; // exact indices where contributions are deployed
      const totalContributed = 1000;

      const metrics = calculateWindowMetrics(
        states, totalContributed, 0.02, 0, '2020-01-01', '2020-03-04',
        contributions, contributionIndices
      );

      // With progressive calculation:
      // Days 0-20: invested = 10000, equity goes from 10000 to ~10645 -> all above water
      // Days 21-41: invested = 10500, equity goes from ~10677 to ~11323 -> all above water
      // Days 42-62: invested = 11000, equity goes from ~11355 to 12000 -> all above water
      // Total underwater days should be 0
      expect(metrics.underwaterDays).toBe(0);

      // Without the fix (comparing against totalInvested=11000 from day 0):
      // Days 0-~16 would be underwater (equity < 11000)
      // That would be ~17 days underwater - much higher
    });

    it('should count underwater days when equity is below invested', () => {
      // Start with 10000, no contributions, equity drops to 9000 and stays there
      const states: PortfolioState[] = [];
      states.push(makeState(0, 10000));
      for (let d = 1; d < 50; d++) {
        states.push(makeState(d, 9000));
      }

      const metrics = calculateWindowMetrics(
        states, 0, 0.02, 0, '2020-01-01', '2020-02-19', [], []
      );

      // All 49 days after day 0 should be underwater (9000 < 10000)
      expect(metrics.underwaterDays).toBe(49);
    });

    it('should handle contributions at irregular intervals', () => {
      // Test with crypto-like scenario where trading happens every day
      // Contributions at days 30, 60, 90 (instead of 21, 42, 63)
      const states: PortfolioState[] = [];
      for (let d = 0; d < 100; d++) {
        const equity = 10000 + (3000 * d / 99); // grows from 10000 to 13000
        states.push(makeState(d, equity));
      }

      const contributions = [500, 500, 500];
      const contributionIndices = [30, 60, 90];
      const totalContributed = 1500;

      const metrics = calculateWindowMetrics(
        states, totalContributed, 0.02, 0, '2020-01-01', '2020-04-10',
        contributions, contributionIndices
      );

      // Equity always above invested because it grows faster than contributions
      // Day 0-29: invested = 10000, equity starts at 10000 and grows
      // Day 30-59: invested = 10500, equity ~10909 and grows
      // Day 60-89: invested = 11000, equity ~11818 and grows
      // Day 90-99: invested = 11500, equity ~12727 and grows
      expect(metrics.underwaterDays).toBe(0);
    });
  });

  describe('selectPercentileWindow', () => {
    it('should select by Sharpe rank', () => {
      const windows: WindowMetrics[] = [
        { windowIndex: 0, sharpe: 0.5 } as WindowMetrics,
        { windowIndex: 1, sharpe: 1.0 } as WindowMetrics,
        { windowIndex: 2, sharpe: 1.5 } as WindowMetrics,
        { windowIndex: 3, sharpe: 2.0 } as WindowMetrics,
        { windowIndex: 4, sharpe: 2.5 } as WindowMetrics,
      ];

      const p10 = selectPercentileWindow(windows, 0.1);
      const p50 = selectPercentileWindow(windows, 0.5);
      const p90 = selectPercentileWindow(windows, 0.9);

      expect(p10.sharpe).toBeLessThan(p50.sharpe);
      expect(p50.sharpe).toBeLessThan(p90.sharpe);
    });
  });
});
