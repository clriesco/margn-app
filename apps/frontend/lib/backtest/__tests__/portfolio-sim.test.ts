import { simulateDay, createInitialState, simulatePortfolioDays } from '../engine/portfolio-sim';
import type { PortfolioState } from '../types';

describe('portfolio-sim', () => {
  describe('createInitialState', () => {
    it('should create correct leveraged position', () => {
      const state = createInitialState(
        10000, 3.0,
        { SPY: 0.6, TLT: 0.4 },
        { SPY: 300, TLT: 140 },
        '2020-01-02'
      );

      expect(state.equity).toBe(10000);
      expect(state.exposure).toBe(30000);
      expect(state.leverage).toBe(3.0);
      expect(state.borrowedAmount).toBe(20000);
      expect(state.positions.SPY.value).toBeCloseTo(18000);
      expect(state.positions.TLT.value).toBeCloseTo(12000);
      expect(state.positions.SPY.quantity).toBeCloseTo(60); // 18000/300
      expect(state.positions.TLT.quantity).toBeCloseTo(85.714, 2); // 12000/140
    });
  });

  describe('simulateDay', () => {
    const state: PortfolioState = {
      day: 0, date: '2020-01-02',
      equity: 10000, exposure: 30000, leverage: 3.0,
      borrowedAmount: 20000,
      positions: {
        SPY: { quantity: 60, value: 18000 },
        TLT: { quantity: 85.714, value: 12000 },
      },
      peakEquity: 10000, marginRatio: 1 / 3, marginCall: false,
    };

    it('should increase equity when market goes up', () => {
      const next = simulateDay(state, { SPY: 0.01, TLT: 0.005 }, '2020-01-03', 0.05);

      // SPY: 18000 * 1.01 = 18180, TLT: 12000 * 1.005 = 12060
      expect(next.exposure).toBeCloseTo(18180 + 12060, 0);
      expect(next.equity).toBeCloseTo(18180 + 12060 - 20000, 0); // exposure - borrowed
      expect(next.borrowedAmount).toBe(20000); // Unchanged between rebalances
      expect(next.equity).toBeGreaterThan(state.equity);
    });

    it('should decrease equity when market goes down', () => {
      const next = simulateDay(state, { SPY: -0.02, TLT: -0.01 }, '2020-01-03', 0.05);

      expect(next.equity).toBeLessThan(state.equity);
      expect(next.borrowedAmount).toBe(20000);
    });

    it('should trigger margin call when equity drops too much', () => {
      // With 3x leverage, a ~35% drop wipes out equity
      // SPY: 18000*0.6=10800, TLT: 12000*0.6=7200, total=18000
      // equity = 18000 - 20000 = -2000, marginRatio = -2000/18000 < 0.05
      const next = simulateDay(state, { SPY: -0.4, TLT: -0.4 }, '2020-01-03', 0.05);

      expect(next.marginCall).toBe(true);
    });

    it('should track peak equity', () => {
      const next = simulateDay(state, { SPY: 0.05, TLT: 0.02 }, '2020-01-03', 0.05);
      expect(next.peakEquity).toBeGreaterThan(state.peakEquity);
    });
  });

  describe('simulatePortfolioDays', () => {
    it('should simulate multiple days', () => {
      const prices = {
        SPY: [300, 303, 306, 304, 308],
        TLT: [140, 141, 140, 142, 141],
      };
      const dates = ['d0', 'd1', 'd2', 'd3', 'd4'];

      const initial = createInitialState(
        10000, 3.0, { SPY: 0.6, TLT: 0.4 },
        { SPY: 300, TLT: 140 }, 'd0'
      );

      const states = simulatePortfolioDays(
        initial, ['SPY', 'TLT'], prices, dates, 0, 4, 0.05
      );

      expect(states).toHaveLength(5); // initial + 4 days
      expect(states[0].equity).toBe(10000);
      // Each day should have different equity
      expect(states[1].equity).not.toBe(states[0].equity);
    });

    it('should stop on margin call', () => {
      const prices = {
        SPY: [300, 150, 75, 37, 18], // Catastrophic drop
        TLT: [140, 70, 35, 17, 8],
      };
      const dates = ['d0', 'd1', 'd2', 'd3', 'd4'];

      const initial = createInitialState(
        10000, 3.0, { SPY: 0.6, TLT: 0.4 },
        { SPY: 300, TLT: 140 }, 'd0'
      );

      const states = simulatePortfolioDays(
        initial, ['SPY', 'TLT'], prices, dates, 0, 4, 0.05
      );

      const lastState = states[states.length - 1];
      expect(lastState.marginCall).toBe(true);
      expect(states.length).toBeLessThanOrEqual(5);
    });
  });
});
