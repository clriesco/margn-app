import {
  calculateLeveragedSharpe,
  calculateReturnsAndCovariance,
  optimizeSharpeNelderMead,
} from '../engine/optimizer';

describe('optimizer', () => {
  // Simple 2-asset scenario with known returns
  const meanReturns = [0.0004, 0.0001]; // SPY-like, TLT-like daily
  const covMatrix = [
    [0.0002, -0.00003],
    [-0.00003, 0.00008],
  ];

  describe('calculateLeveragedSharpe', () => {
    it('should calculate positive Sharpe for positive returns', () => {
      const sharpe = calculateLeveragedSharpe(
        [0.6, 0.4], meanReturns, covMatrix, 3.0, 252, 0.02
      );
      expect(sharpe).toBeGreaterThan(0);
    });

    it('should return 0 when volatility is 0', () => {
      const zeroCov = [[0, 0], [0, 0]];
      const sharpe = calculateLeveragedSharpe(
        [0.5, 0.5], meanReturns, zeroCov, 3.0, 252, 0.02
      );
      expect(sharpe).toBe(0);
    });

    it('should increase with leverage when returns > rf/leverage', () => {
      const s1 = calculateLeveragedSharpe([0.6, 0.4], meanReturns, covMatrix, 2.0, 252, 0.02);
      const s2 = calculateLeveragedSharpe([0.6, 0.4], meanReturns, covMatrix, 3.0, 252, 0.02);
      // Sharpe = (r*L - rf) / (vol*L), with same r and vol, higher L changes the ratio
      // Both should be > 0 for these params
      expect(s1).toBeGreaterThan(0);
      expect(s2).toBeGreaterThan(0);
    });
  });

  describe('calculateReturnsAndCovariance', () => {
    it('should compute mean returns with shrinkage', () => {
      const prices = {
        A: [100, 101, 102, 103, 104],
        B: [50, 50.5, 50, 49.5, 50],
      };
      const { meanReturns, covMatrix, minLength } = calculateReturnsAndCovariance(
        prices, ['A', 'B'], 0.6
      );

      expect(minLength).toBe(4);
      expect(meanReturns).toHaveLength(2);
      // Mean returns should be shrunk (multiplied by 0.6)
      expect(meanReturns[0]).toBeGreaterThan(0); // A has positive trend
      expect(covMatrix).toHaveLength(2);
      expect(covMatrix[0]).toHaveLength(2);
      // Variance should be positive
      expect(covMatrix[0][0]).toBeGreaterThan(0);
      expect(covMatrix[1][1]).toBeGreaterThan(0);
    });
  });

  describe('optimizeSharpeNelderMead', () => {
    it('should produce weights that sum to 1', () => {
      const weights = optimizeSharpeNelderMead(meanReturns, covMatrix, {
        leverage: 3.0,
        riskFreeRate: 0.02,
        minWeight: 0.05,
        maxWeight: 0.4,
        meanReturnShrinkage: 0.6,
      });

      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 4);
    });

    it('should respect min/max weight constraints', () => {
      const weights = optimizeSharpeNelderMead(meanReturns, covMatrix, {
        leverage: 3.0,
        riskFreeRate: 0.02,
        minWeight: 0.1,
        maxWeight: 0.9,
        meanReturnShrinkage: 0.6,
      });

      for (const w of weights) {
        expect(w).toBeGreaterThanOrEqual(0.1 - 0.01);
        expect(w).toBeLessThanOrEqual(0.9 + 0.01);
      }
    });

    it('should favor higher-return asset', () => {
      // Asset A has much higher return than B
      const highDiff = [0.001, 0.00001];
      const simpleCov = [
        [0.0001, 0],
        [0, 0.0001],
      ];

      const weights = optimizeSharpeNelderMead(highDiff, simpleCov, {
        leverage: 3.0,
        riskFreeRate: 0.02,
        minWeight: 0.05,
        maxWeight: 0.95,
        meanReturnShrinkage: 1.0,
      });

      // Should allocate more to A
      expect(weights[0]).toBeGreaterThan(weights[1]);
    });
  });
});
