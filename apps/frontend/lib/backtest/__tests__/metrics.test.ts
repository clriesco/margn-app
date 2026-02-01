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
