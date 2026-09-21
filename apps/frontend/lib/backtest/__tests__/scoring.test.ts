import { computeBacktestScore } from '../scoring';

describe('computeBacktestScore', () => {
  const scenario = (cagr: number, sharpe: number, maxDrawdown: number) => ({ cagr, sharpe, maxDrawdown });
  const score = (p10Drawdown: number, sharpe = 1, marginCallCount = 0) =>
    computeBacktestScore({
      p10: scenario(0.2, sharpe, -p10Drawdown),
      p50: scenario(0.25, sharpe, -p10Drawdown),
      p90: scenario(0.3, sharpe, -p10Drawdown),
      marginCallCount,
    });

  it('barely penalises a 10% drawdown and gives nothing for 80%', () => {
    expect(score(0.1).dimensions.drawdown).toBeGreaterThan(97);
    expect(score(0.8).dimensions.drawdown).toBe(0);
    expect(score(0.95).dimensions.drawdown).toBe(0);
  });

  it('penalises drawdown faster the deeper it gets', () => {
    const at = (dd: number) => score(dd).dimensions.drawdown;
    expect(at(0.2) - at(0.3)).toBeLessThan(at(0.5) - at(0.6));
  });

  it('rewards Sharpe with diminishing returns and never saturates at realistic values', () => {
    const at = (s: number) => score(0.3, s).dimensions.sharpe;
    expect(at(1) - at(0.5)).toBeGreaterThan(at(2) - at(1.5));
    expect(at(1.5)).toBeLessThan(100);
    expect(at(-0.5)).toBe(0);
  });

  it('scores an unleveraged S&P 500 around 70', () => {
    // 5-year windows 2015-2026, buy and hold with the same contributions
    const sp500 = computeBacktestScore({
      p10: scenario(0.098, 0.5, -0.337),
      p50: scenario(0.145, 0.69, -0.337),
      p90: scenario(0.172, 0.85, -0.337),
      marginCallCount: 0,
    });
    expect(sp500.composite).toBeGreaterThan(62);
    expect(sp500.composite).toBeLessThan(78);
  });

  it('gives 95 to a strategy that is excellent on every dimension', () => {
    // Sharpe 1.5, worst case earning what it can lose, 18% drawdown, tight scenarios
    const excellent = computeBacktestScore({
      p10: scenario(0.18, 1.45, -0.18),
      p50: scenario(0.2, 1.58, -0.17),
      p90: scenario(0.22, 1.7, -0.16),
      marginCallCount: 0,
    });
    expect(excellent.composite).toBeGreaterThanOrEqual(94);
    for (const value of Object.values(excellent.dimensions)) expect(value).toBeGreaterThanOrEqual(94);
  });

  it('does not let strong dimensions buy back a 70% drawdown', () => {
    const strong = (p10Drawdown: number) => computeBacktestScore({
      p10: scenario(0.4, 0.95, -p10Drawdown),
      p50: scenario(0.5, 1.1, -p10Drawdown),
      p90: scenario(0.6, 1.3, -p10Drawdown),
      marginCallCount: 0,
    });
    expect(strong(0.3).composite).toBeGreaterThanOrEqual(70);
    expect(strong(0.7).composite).toBeLessThan(65);
    // Same Sharpe in both: only the drawdown-driven dimensions may move the composite
    expect(strong(0.7).dimensions.sharpe).toBe(strong(0.3).dimensions.sharpe);
  });

  it('scores zero overall when the worst case is a ruinous drawdown', () => {
    expect(score(0.8, 1.5).composite).toBe(0);
  });

  it('caps the composite when any window was margin-called', () => {
    expect(score(0.2, 1.2, 1).composite).toBeLessThanOrEqual(20);
    expect(score(0.2, 1.2, 1).marginCallPenalty).toBe(true);
  });
});
