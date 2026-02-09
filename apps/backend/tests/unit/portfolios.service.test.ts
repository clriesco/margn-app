import { NotFoundException } from "@nestjs/common";

import { PortfoliosService } from "../../src/portfolios/portfolios.service";

describe("PortfoliosService", () => {
  let service: PortfoliosService;
  let mockPrisma: any;

  const baseUser = {
    id: "user-1",
    email: "test@example.com",
    fullName: "Test User",
  };

  const baseAssets = [
    { id: "asset-spy", symbol: "SPY", name: "S&P 500", assetType: "index" },
    { id: "asset-gld", symbol: "GLD", name: "Gold", assetType: "commodity" },
  ];

  const basePositions = [
    {
      id: "pos-1",
      portfolioId: "port-1",
      assetId: "asset-spy",
      asset: baseAssets[0],
      quantity: 60,
      avgPrice: 450,
      exposureUsd: 27000,
    },
    {
      id: "pos-2",
      portfolioId: "port-1",
      assetId: "asset-gld",
      asset: baseAssets[1],
      quantity: 50,
      avgPrice: 180,
      exposureUsd: 9000,
    },
  ];

  const basePortfolio = {
    id: "port-1",
    userId: "user-1",
    name: "Test Portfolio",
    baseCurrency: "USD",
    initialCapital: 10000,
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    createdAt: new Date("2024-01-01"),
    positions: basePositions,
    contributions: [],
  };

  beforeEach(() => {
    mockPrisma = {
      user: { findUnique: jest.fn() },
      portfolio: { findUnique: jest.fn() },
      metricsTimeseries: { findFirst: jest.fn(), findMany: jest.fn() },
      dailyMetric: { findFirst: jest.fn(), findMany: jest.fn() },
      monthlyContribution: { findMany: jest.fn() },
      assetPrice: { findFirst: jest.fn() },
    };

    service = new PortfoliosService(mockPrisma);
  });

  // ─────────────────────────────────────────────
  // findByUserEmail
  // ─────────────────────────────────────────────
  describe("findByUserEmail", () => {
    it("returns portfolios when user exists", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        portfolios: [{ ...basePortfolio }],
      });

      const result = await service.findByUserEmail("test@example.com");

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("port-1");
      expect(result[0].positions).toHaveLength(2);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        include: {
          portfolios: {
            include: {
              positions: {
                include: { asset: true },
              },
            },
          },
        },
      });
    });

    it("returns empty array when user not found", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.findByUserEmail("noone@example.com");

      expect(result).toEqual([]);
    });

    it("returns empty array when user has no portfolios", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        portfolios: [],
      });

      const result = await service.findByUserEmail("test@example.com");

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // findById
  // ─────────────────────────────────────────────
  describe("findById", () => {
    it("returns portfolio with positions and contributions", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        ...basePortfolio,
        contributions: [
          { id: "c-1", amount: 1000, contributedAt: new Date() },
        ],
      });

      const result = await service.findById("port-1");

      expect(result.id).toBe("port-1");
      expect(result.positions).toHaveLength(2);
      expect(result.contributions).toHaveLength(1);
    });

    it("throws NotFoundException when portfolio not found", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(service.findById("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ─────────────────────────────────────────────
  // getMetrics
  // ─────────────────────────────────────────────
  describe("getMetrics", () => {
    it("returns metrics enriched with contribution and PnL data", async () => {
      const date1 = new Date("2024-06-01");
      const date2 = new Date("2024-06-02");
      const date3 = new Date("2024-06-03");

      mockPrisma.metricsTimeseries.findMany.mockResolvedValue([
        { id: "m-1", portfolioId: "port-1", date: date1, equity: 10000, exposure: 30000, leverage: 3.0, metadataJson: null },
        { id: "m-2", portfolioId: "port-1", date: date2, equity: 10500, exposure: 31000, leverage: 2.95, metadataJson: null },
        { id: "m-3", portfolioId: "port-1", date: date3, equity: 11500, exposure: 32000, leverage: 2.78, metadataJson: null },
      ]);

      // Contribution on date3
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([
        { id: "c-1", amount: 500, contributedAt: date3, type: "contribution" },
      ]);

      const result = await service.getMetrics("port-1");

      expect(result).toHaveLength(3);

      // First metric: no previous, PnL=0
      expect(result[0].pnl).toBe(0);
      expect(result[0].contribution).toBe(0);

      // Second metric: PnL = 10500 - 10000 - 0 = 500
      expect(result[1].pnl).toBe(500);
      expect(result[1].contribution).toBe(0);

      // Third metric: PnL = 11500 - 10500 - 500(contribution) = 500
      expect(result[2].pnl).toBe(500);
      expect(result[2].contribution).toBe(500);
    });

    it("returns empty array when no metrics exist", async () => {
      mockPrisma.metricsTimeseries.findMany.mockResolvedValue([]);
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([]);

      const result = await service.getMetrics("port-1");

      expect(result).toEqual([]);
    });

    it("correctly handles withdrawal contributions (negative signed amounts)", async () => {
      const date1 = new Date("2024-06-01");
      const date2 = new Date("2024-06-02");

      mockPrisma.metricsTimeseries.findMany.mockResolvedValue([
        { id: "m-1", portfolioId: "port-1", date: date1, equity: 15000, exposure: 45000, leverage: 3.0, metadataJson: null },
        { id: "m-2", portfolioId: "port-1", date: date2, equity: 12000, exposure: 43000, leverage: 3.58, metadataJson: null },
      ]);

      mockPrisma.monthlyContribution.findMany.mockResolvedValue([
        { id: "c-1", amount: 2000, contributedAt: date2, type: "withdrawal" },
      ]);

      const result = await service.getMetrics("port-1");

      // withdrawal is -2000
      expect(result[1].contribution).toBe(-2000);
      // PnL = 12000 - 15000 - (-2000) = -1000
      expect(result[1].pnl).toBe(-1000);
    });

    it("parses metadataJson when present", async () => {
      const date1 = new Date("2024-06-01");
      const metadata = { source: "contribution", contributions: ["c-1"] };

      mockPrisma.metricsTimeseries.findMany.mockResolvedValue([
        { id: "m-1", portfolioId: "port-1", date: date1, equity: 10000, exposure: 30000, leverage: 3.0, metadataJson: JSON.stringify(metadata) },
      ]);
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([]);

      const result = await service.getMetrics("port-1");

      expect(result[0].metadata).toEqual(metadata);
    });
  });

  // ─────────────────────────────────────────────
  // getContributionHistory
  // ─────────────────────────────────────────────
  describe("getContributionHistory", () => {
    it("returns rows starting with initial capital row", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        initialCapital: 10000,
        createdAt: new Date("2024-01-01"),
      });
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([]);

      const result = await service.getContributionHistory("port-1");

      expect(result).toHaveLength(1);
      expect(result[0].contribution).toBe(10000);
      expect(result[0].cumulative).toBe(10000);
      expect(result[0].type).toBe("initial");
    });

    it("correctly accumulates contributions", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        initialCapital: 10000,
        createdAt: new Date("2024-01-01"),
      });
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([
        { id: "c-1", amount: 1000, contributedAt: new Date("2024-02-01"), type: "contribution" },
        { id: "c-2", amount: 1500, contributedAt: new Date("2024-03-01"), type: "contribution" },
      ]);

      const result = await service.getContributionHistory("port-1");

      expect(result).toHaveLength(3);
      expect(result[0].cumulative).toBe(10000); // initial
      expect(result[1].cumulative).toBe(11000); // +1000
      expect(result[2].cumulative).toBe(12500); // +1500
    });

    it("handles withdrawals (negative amounts, cumulative decreases)", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue({
        initialCapital: 10000,
        createdAt: new Date("2024-01-01"),
      });
      mockPrisma.monthlyContribution.findMany.mockResolvedValue([
        { id: "c-1", amount: 2000, contributedAt: new Date("2024-02-01"), type: "contribution" },
        { id: "c-2", amount: 3000, contributedAt: new Date("2024-03-01"), type: "withdrawal" },
      ]);

      const result = await service.getContributionHistory("port-1");

      expect(result).toHaveLength(3);
      expect(result[1].contribution).toBe(2000);
      expect(result[1].cumulative).toBe(12000);
      expect(result[2].contribution).toBe(-3000); // withdrawal is negative
      expect(result[2].cumulative).toBe(9000);
      expect(result[2].type).toBe("withdrawal");
    });

    it("throws NotFoundException when portfolio not found", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(
        service.getContributionHistory("nonexistent")
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────────────────────
  // getSummary
  // ─────────────────────────────────────────────
  describe("getSummary", () => {
    function setupSummaryMocks(overrides: {
      portfolio?: any;
      latestDailyMetric?: any;
      latestMetrics?: any;
      firstMetrics?: any;
      allMetrics?: any[];
      prices?: Record<string, number>;
    } = {}) {
      const portfolio = overrides.portfolio ?? {
        ...basePortfolio,
        contributions: [
          { id: "c-1", amount: 2000, type: "contribution", contributedAt: new Date("2024-03-01") },
        ],
      };

      mockPrisma.portfolio.findUnique.mockResolvedValue(portfolio);

      // dailyMetric findFirst — use "in" check to allow explicit null
      const dailyMetric = "latestDailyMetric" in overrides
        ? overrides.latestDailyMetric
        : { equity: 15000, date: new Date("2024-06-01") };
      mockPrisma.dailyMetric.findFirst.mockResolvedValue(dailyMetric);

      // metricsTimeseries findFirst — first call = latest, second = first
      const latestMetrics = "latestMetrics" in overrides
        ? overrides.latestMetrics
        : { id: "mt-latest", date: new Date("2024-06-01"), equity: 14500, exposure: 42000, leverage: 2.9 };
      const firstMetrics = "firstMetrics" in overrides
        ? overrides.firstMetrics
        : { id: "mt-first", date: new Date("2024-01-01"), equity: 10000, exposure: 30000, leverage: 3.0 };
      mockPrisma.metricsTimeseries.findFirst
        .mockResolvedValueOnce(latestMetrics) // latest (desc)
        .mockResolvedValueOnce(firstMetrics); // first (asc)

      // All metrics for getMetrics (called by getSummary for analytics)
      const allMetrics = overrides.allMetrics ?? [
        { id: "mt-first", portfolioId: "port-1", date: new Date("2024-01-01"), equity: 10000, exposure: 30000, leverage: 3.0, metadataJson: null },
        { id: "mt-latest", portfolioId: "port-1", date: new Date("2024-06-01"), equity: 15000, exposure: 42000, leverage: 2.8, metadataJson: null },
      ];
      mockPrisma.metricsTimeseries.findMany.mockResolvedValue(allMetrics);

      // Contributions for getMetrics
      mockPrisma.monthlyContribution.findMany.mockResolvedValue(
        portfolio.contributions || []
      );

      // Latest asset prices
      const prices = overrides.prices ?? {
        "asset-spy": 500,
        "asset-gld": 200,
      };
      mockPrisma.assetPrice.findFirst.mockImplementation(
        ({ where }: any) => {
          const price = prices[where.assetId as string];
          return Promise.resolve(
            price ? { close: price } : null
          );
        }
      );
    }

    it("returns complete summary with equity from DailyMetric", async () => {
      setupSummaryMocks({ latestDailyMetric: { equity: 15000, date: new Date("2024-06-01") } });

      const result = await service.getSummary("port-1");

      expect(result.metrics.equity).toBe(15000);
      expect(result.portfolio.id).toBe("port-1");
      expect(result.positions).toHaveLength(2);
    });

    it("falls back to MetricsTimeseries equity when no DailyMetric", async () => {
      setupSummaryMocks({ latestDailyMetric: null });

      const result = await service.getSummary("port-1");

      // Falls back to latestMetrics.equity (14500)
      expect(result.metrics.equity).toBe(14500);
    });

    it("falls back to initialCapital when no metrics exist", async () => {
      setupSummaryMocks({
        latestDailyMetric: null,
        latestMetrics: null,
        firstMetrics: null,
      });

      const result = await service.getSummary("port-1");

      expect(result.metrics.equity).toBe(10000); // initialCapital
    });

    it("calculates exposure from positions x latest prices", async () => {
      // SPY: 60 shares × $500 = $30,000
      // GLD: 50 shares × $200 = $10,000
      // Total exposure = $40,000
      setupSummaryMocks({ prices: { "asset-spy": 500, "asset-gld": 200 } });

      const result = await service.getSummary("port-1");

      expect(result.metrics.exposure).toBe(40000);
    });

    it("calculates leverage as exposure/equity", async () => {
      // equity=15000, exposure=40000 → leverage=2.667
      setupSummaryMocks({
        latestDailyMetric: { equity: 15000, date: new Date() },
        prices: { "asset-spy": 500, "asset-gld": 200 },
      });

      const result = await service.getSummary("port-1");

      expect(result.metrics.leverage).toBeCloseTo(40000 / 15000, 2);
    });

    it("calculates absoluteReturn as (equity + withdrawn) - totalContributions", async () => {
      // totalContributions = initialCapital(10000) + deposits(2000) = 12000
      // totalWithdrawn = 0
      // absoluteReturn = (15000 + 0) - 12000 = 3000
      setupSummaryMocks({
        latestDailyMetric: { equity: 15000, date: new Date() },
      });

      const result = await service.getSummary("port-1");

      expect(result.metrics.absoluteReturn).toBe(3000);
      expect(result.metrics.totalContributions).toBe(12000);
    });

    it("returns positions with weights, PnL, and current prices", async () => {
      setupSummaryMocks({
        prices: { "asset-spy": 500, "asset-gld": 200 },
      });

      const result = await service.getSummary("port-1");

      const spyPos = result.positions.find((p: any) => p.asset.symbol === "SPY");
      expect(spyPos.currentPrice).toBe(500);
      expect(spyPos.pnl).toBe((500 - 450) * 60); // (currentPrice - avgPrice) * quantity = 3000
      expect(spyPos.weight).toBeCloseTo((60 * 500) / 40000 * 100, 1); // 75%

      const gldPos = result.positions.find((p: any) => p.asset.symbol === "GLD");
      expect(gldPos.currentPrice).toBe(200);
      expect(gldPos.pnl).toBe((200 - 180) * 50); // 1000
    });

    it("throws NotFoundException when portfolio not found", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(service.getSummary("nonexistent")).rejects.toThrow(
        NotFoundException
      );
    });

    it("includes analytics with CAGR, Sharpe, and drawdown", async () => {
      setupSummaryMocks();

      const result = await service.getSummary("port-1");

      expect(result.analytics).toBeDefined();
      expect(typeof result.analytics.cagr).toBe("number");
      expect(typeof result.analytics.sharpe).toBe("number");
      expect(typeof result.analytics.maxDrawdownEquity).toBe("number");
      expect(typeof result.analytics.underwaterDays).toBe("number");
      expect(typeof result.analytics.totalInvested).toBe("number");
    });

    it("handles portfolio with withdrawals in return calculations", async () => {
      const portfolioWithWithdrawals = {
        ...basePortfolio,
        contributions: [
          { id: "c-1", amount: 2000, type: "contribution", contributedAt: new Date("2024-02-01") },
          { id: "c-2", amount: 1000, type: "withdrawal", contributedAt: new Date("2024-04-01") },
        ],
      };

      setupSummaryMocks({
        portfolio: portfolioWithWithdrawals,
        latestDailyMetric: { equity: 14000, date: new Date() },
      });

      const result = await service.getSummary("port-1");

      // totalDeposited = 2000 (only contributions, not withdrawals)
      // totalWithdrawn = 1000
      // totalContributions = 10000 + 2000 = 12000
      // absoluteReturn = (14000 + 1000) - 12000 = 3000
      expect(result.metrics.totalContributions).toBe(12000);
      expect(result.metrics.totalWithdrawn).toBe(1000);
      expect(result.metrics.absoluteReturn).toBe(3000);
    });
  });

  // ─────────────────────────────────────────────
  // getDailyMetrics
  // ─────────────────────────────────────────────
  describe("getDailyMetrics", () => {
    it("returns daily metrics ordered by date ascending", async () => {
      const metrics = [
        { id: "dm-1", date: new Date("2024-01-01"), equity: 10000 },
        { id: "dm-2", date: new Date("2024-01-02"), equity: 10100 },
      ];
      mockPrisma.dailyMetric.findMany.mockResolvedValue(metrics);

      const result = await service.getDailyMetrics("port-1");

      expect(result).toEqual(metrics);
      expect(mockPrisma.dailyMetric.findMany).toHaveBeenCalledWith({
        where: { portfolioId: "port-1" },
        orderBy: { date: "asc" },
      });
    });
  });
});
