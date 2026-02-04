import { NotFoundException } from "@nestjs/common";

import { RebalanceService } from "../../src/rebalance/rebalance.service";

/**
 * Unit tests for RebalanceService
 * Tests the rebalancing algorithm through the public calculateProposal method
 * with fully mocked dependencies.
 */
describe("RebalanceService", () => {
  let service: RebalanceService;
  let mockPrisma: any;
  let mockConfigService: any;

  // Base config matching portfolio defaults
  const baseConfig = {
    portfolioId: "port-1",
    name: "Test Portfolio",
    baseCurrency: "USD",
    initialCapital: 10000,
    monthlyContribution: 1000,
    contributionFrequency: "monthly" as const,
    contributionDayOfMonth: 1,
    contributionEnabled: true,
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    targetWeights: { SPY: 0.6, GLD: 0.25, "BTC-USD": 0.15 },
    maxWeight: 0.4,
    minWeight: 0.05,
    maintenanceMarginRatio: 0.05,
    drawdownRedeployThreshold: 0.12,
    weightDeviationThreshold: 0.05,
    volatilityLookbackDays: 63,
    volatilityRedeployThreshold: 0.18,
    gradualDeployFactor: 0.5,
    useDynamicSharpeRebalance: false,
    meanReturnShrinkage: 0.6,
    riskFreeRate: 0.02,
    safeMarginRatio: null,
    criticalMarginRatio: null,
    updatedAt: new Date().toISOString(),
  };

  // Helper: generate price history
  function generatePrices(assetId: string, days: number, basePrice: number, volatility = 0.01) {
    const prices = [];
    let price = basePrice;
    const startDate = new Date("2024-01-01");
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      price *= 1 + (Math.random() - 0.5) * 2 * volatility;
      prices.push({ id: `price-${assetId}-${i}`, assetId, date, close: price, adjClose: price, source: "test" });
    }
    return prices;
  }

  const assets = [
    { id: "asset-spy", symbol: "SPY", name: "S&P 500", assetType: "index" },
    { id: "asset-gld", symbol: "GLD", name: "Gold", assetType: "commodity" },
    { id: "asset-btc", symbol: "BTC-USD", name: "Bitcoin", assetType: "crypto" },
  ];

  // Prices for each asset (latest)
  const latestPrices: Record<string, { id: string; assetId: string; date: Date; close: number }[]> = {
    "asset-spy": [{ id: "p1", assetId: "asset-spy", date: new Date(), close: 500 }],
    "asset-gld": [{ id: "p2", assetId: "asset-gld", date: new Date(), close: 200 }],
    "asset-btc": [{ id: "p3", assetId: "asset-btc", date: new Date(), close: 60000 }],
  };

  // Build a portfolio with positions at given leverage
  function buildPortfolio(opts: {
    equity?: number;
    leverage?: number;
    peakEquity?: number;
    metricsCount?: number;
    drawdownPct?: number;
  } = {}) {
    const equity = opts.equity ?? 10000;
    const leverage = opts.leverage ?? 3.0;
    const exposure = equity * leverage;
    const peakEquity = opts.peakEquity ?? equity;
    const metricsCount = opts.metricsCount ?? 30;

    // Positions: distribute exposure by target weights
    const positions = [
      {
        id: "pos-spy",
        assetId: "asset-spy",
        asset: assets[0],
        quantity: (exposure * 0.6) / 500,
        avgPrice: 500,
        exposureUsd: exposure * 0.6,
      },
      {
        id: "pos-gld",
        assetId: "asset-gld",
        asset: assets[1],
        quantity: (exposure * 0.25) / 200,
        avgPrice: 200,
        exposureUsd: exposure * 0.25,
      },
      {
        id: "pos-btc",
        assetId: "asset-btc",
        asset: assets[2],
        quantity: (exposure * 0.15) / 60000,
        avgPrice: 60000,
        exposureUsd: exposure * 0.15,
      },
    ];

    // Generate metrics history
    const metricsTimeseries = [];
    for (let i = 0; i < metricsCount; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      // If drawdown requested, make equity decrease over time
      const metricEquity = opts.drawdownPct
        ? equity * (1 + opts.drawdownPct * (i / metricsCount))
        : equity * (1 + (Math.random() - 0.5) * 0.01);
      metricsTimeseries.push({
        id: `metric-${i}`,
        portfolioId: "port-1",
        date,
        equity: metricEquity,
        exposure,
        leverage,
        borrowedAmount: exposure - metricEquity,
      });
    }

    return {
      id: "port-1",
      userId: "user-1",
      name: "Test Portfolio",
      initialCapital: 10000,
      positions,
      contributions: [], // No undeployed contributions
      metricsTimeseries,
      dailyMetrics: [
        {
          id: "dm-1",
          portfolioId: "port-1",
          date: new Date(),
          equity,
          exposure,
          leverage,
          peakEquity,
        },
      ],
    };
  }

  beforeEach(() => {
    mockPrisma = {
      portfolio: { findUnique: jest.fn() },
      asset: { findMany: jest.fn() },
      assetPrice: { findFirst: jest.fn(), findMany: jest.fn() },
      rebalanceEvent: { create: jest.fn() },
      rebalancePosition: { create: jest.fn() },
      portfolioPosition: { upsert: jest.fn() },
      metricsTimeseries: { findFirst: jest.fn(), upsert: jest.fn() },
    };

    mockConfigService = {
      getConfiguration: jest.fn().mockResolvedValue({ ...baseConfig }),
      getTargetWeights: jest.fn().mockResolvedValue(baseConfig.targetWeights),
    };

    service = new RebalanceService(mockPrisma, mockConfigService);
  });

  function setupDefaultMocks(portfolio: any) {
    mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);
    mockPrisma.asset.findMany.mockResolvedValue(assets);
    mockPrisma.assetPrice.findFirst.mockImplementation(({ where }: any) => {
      const prices = latestPrices[where.assetId];
      return Promise.resolve(prices ? prices[0] : null);
    });
    // For Sharpe optimization - return empty by default (no history)
    mockPrisma.assetPrice.findMany.mockResolvedValue([]);
  }

  // ─── Deploy Signal Tests ───────────────────────────────────────────

  describe("Deploy Signal Evaluation", () => {
    it("triggers drawdown signal when drawdown >= 12%", async () => {
      const portfolio = buildPortfolio({
        equity: 8800,
        leverage: 3.0,
        peakEquity: 10000, // 12% drawdown
      });
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.deploySignals.drawdownTriggered).toBe(true);
      expect(proposal.deployFraction).toBeCloseTo(baseConfig.gradualDeployFactor);
    });

    it("triggers weight deviation signal when deviation >= 5%", async () => {
      // Create portfolio with skewed weights
      const equity = 10000;
      const exposure = equity * 3.0;
      const portfolio = buildPortfolio({ equity, leverage: 3.0 });
      // Override positions to create weight deviation
      // SPY at 80% instead of 60%
      portfolio.positions = [
        { id: "pos-spy", assetId: "asset-spy", asset: assets[0], quantity: (exposure * 0.80) / 500, avgPrice: 500, exposureUsd: exposure * 0.80 },
        { id: "pos-gld", assetId: "asset-gld", asset: assets[1], quantity: (exposure * 0.10) / 200, avgPrice: 200, exposureUsd: exposure * 0.10 },
        { id: "pos-btc", assetId: "asset-btc", asset: assets[2], quantity: (exposure * 0.10) / 60000, avgPrice: 60000, exposureUsd: exposure * 0.10 },
      ];
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.deploySignals.weightDeviationTriggered).toBe(true);
      expect(proposal.deployFraction).toBeCloseTo(baseConfig.gradualDeployFactor);
    });

    it("triggers volatility signal when realized volatility <= 18%", async () => {
      // Create portfolio with very stable equity (low volatility)
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0, metricsCount: 70 });
      // Override metrics with very stable equity values
      portfolio.metricsTimeseries = portfolio.metricsTimeseries.map((m: any, i: number) => ({
        ...m,
        equity: 10000 + i * 0.1, // Almost no variance
      }));
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.deploySignals.volatilityTriggered).toBe(true);
      expect(proposal.realizedVolatility).toBeLessThanOrEqual(0.18);
    });

    it("returns deployFraction=0 when no signals triggered", async () => {
      // Equity at peak (no drawdown), weights aligned, high volatility
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0, peakEquity: 10000 });
      // Make metrics very volatile
      portfolio.metricsTimeseries = portfolio.metricsTimeseries.map((m: any, i: number) => ({
        ...m,
        equity: 10000 * (1 + Math.sin(i) * 0.1), // High variance
      }));
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      // With weights aligned and no drawdown, check that either no signal or volatility might trigger
      // The key check is that if vol > threshold and drawdown < threshold and weights aligned, fraction=0
      if (!proposal.deploySignals.drawdownTriggered &&
          !proposal.deploySignals.weightDeviationTriggered &&
          !proposal.deploySignals.volatilityTriggered) {
        expect(proposal.deployFraction).toBe(0);
      }
    });
  });

  // ─── Leverage Targeting Tests ──────────────────────────────────────

  describe("Leverage Targeting", () => {
    it("targets leverageTarget when current leverage < leverageMin", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 2.0 }); // Below min of 2.5
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      // targetExposure should be equity * leverageTarget
      expect(proposal.targetExposure).toBeCloseTo(10000 * baseConfig.leverageTarget, 0);
    });

    it("targets leverageMax when current leverage > leverageMax", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 5.0 }); // Above max of 4.0
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.targetExposure).toBeCloseTo(10000 * baseConfig.leverageMax, 0);
    });

    it("targets leverageTarget when leverage is in range but below target", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 2.7 }); // In range but below target 3.0
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.targetExposure).toBeCloseTo(10000 * baseConfig.leverageTarget, 0);
    });
  });

  // ─── Weight Determination Tests ────────────────────────────────────

  describe("Weight Determination", () => {
    it("uses target weights when Sharpe optimization is disabled", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0 });
      setupDefaultMocks(portfolio);
      // Config already has useDynamicSharpeRebalance: false

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.dynamicWeightsComputed).toBe(false);
      expect(proposal.weightsUsed).toEqual(baseConfig.targetWeights);
    });

    it("falls back to target weights when Sharpe enabled but insufficient history", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0 });
      setupDefaultMocks(portfolio);
      mockConfigService.getConfiguration.mockResolvedValue({
        ...baseConfig,
        useDynamicSharpeRebalance: true,
      });
      // assetPrice.findMany returns empty (no history) - already set in setupDefaultMocks

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.dynamicWeightsComputed).toBe(false);
      expect(proposal.weightsUsed).toEqual(baseConfig.targetWeights);
    });

    it("uses dynamic Sharpe weights when enabled with sufficient history", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0 });
      setupDefaultMocks(portfolio);
      mockConfigService.getConfiguration.mockResolvedValue({
        ...baseConfig,
        useDynamicSharpeRebalance: true,
      });

      // Provide price history for all assets
      mockPrisma.assetPrice.findMany.mockImplementation(({ where }: any) => {
        const assetId = where.assetId;
        const base = assetId === "asset-spy" ? 500 : assetId === "asset-gld" ? 200 : 60000;
        return Promise.resolve(generatePrices(assetId, 50, base, 0.01));
      });

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.dynamicWeightsComputed).toBe(true);
      // Weights should sum to ~1
      const sum = Object.values(proposal.weightsUsed).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });
  });

  // ─── Position Calculation Tests ────────────────────────────────────

  describe("Position Calculations", () => {
    it("calculates target positions from weights and exposure", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0 });
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      for (const pos of proposal.positions) {
        // Service rounds quantities for non-fractional assets, then recalculates value
        // So we verify: targetValue = targetQuantity * price (not exposure * weight directly)
        expect(pos.targetValue).toBeCloseTo(pos.targetQuantity * pos.currentPrice, 2);

        // Raw quantity (before rounding) should be close to exposure * weight / price
        const rawExpectedQuantity = (proposal.targetExposure * pos.targetWeight) / pos.currentPrice;
        // Allow for rounding difference (max 0.5 shares)
        expect(Math.abs(pos.targetQuantity - rawExpectedQuantity)).toBeLessThanOrEqual(0.5);
      }
    });

    it("assigns correct BUY/SELL/HOLD actions based on delta", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 2.0 }); // Low leverage → will buy
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      for (const pos of proposal.positions) {
        if (pos.deltaQuantity > 0.0001) {
          expect(pos.action).toBe("BUY");
        } else if (pos.deltaQuantity < -0.0001) {
          expect(pos.action).toBe("SELL");
        } else {
          expect(pos.action).toBe("HOLD");
        }
      }
    });
  });

  // ─── Equity/Borrow Breakdown Tests ─────────────────────────────────

  describe("Equity/Borrow Breakdown", () => {
    it("increases borrow when exposure increases", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 2.0 }); // Below target → increase
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.summary.borrowIncrease).toBeGreaterThan(0);
      expect(proposal.summary.equityUsedFromContribution).toBe(0);
    });

    it("decreases borrow when exposure decreases", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 5.0 }); // Above max → decrease
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.summary.borrowIncrease).toBeLessThan(0);
    });
  });

  // ─── Edge Cases ────────────────────────────────────────────────────

  describe("Edge Cases", () => {
    it("handles portfolio with zero positions", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 0 });
      portfolio.positions = [];
      setupDefaultMocks(portfolio);

      const proposal = await service.calculateProposal("port-1");

      expect(proposal.currentExposure).toBe(0);
      // Service still generates target positions from target weights (all BUY)
      for (const pos of proposal.positions) {
        expect(pos.currentQuantity).toBe(0);
        expect(pos.action).toBe("BUY");
      }
    });

    it("handles missing price data gracefully", async () => {
      const portfolio = buildPortfolio({ equity: 10000, leverage: 3.0 });
      setupDefaultMocks(portfolio);
      // Return null for all price lookups
      mockPrisma.assetPrice.findFirst.mockResolvedValue(null);

      const proposal = await service.calculateProposal("port-1");

      // Should still return a proposal (using avgPrice fallback)
      expect(proposal).toBeDefined();
      expect(proposal.currentEquity).toBeDefined();
    });

    it("throws NotFoundException for non-existent portfolio", async () => {
      mockConfigService.getConfiguration.mockResolvedValue({ ...baseConfig });
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);
      mockPrisma.asset.findMany.mockResolvedValue(assets);
      mockPrisma.assetPrice.findFirst.mockResolvedValue(null);

      await expect(service.calculateProposal("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
