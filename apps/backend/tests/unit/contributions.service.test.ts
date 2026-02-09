import { BadRequestException, NotFoundException } from "@nestjs/common";

import { ContributionsService } from "../../src/contributions/contributions.service";

describe("ContributionsService", () => {
  let service: ContributionsService;
  let mockPrisma: any;

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
      avgPrice: 500,
      exposureUsd: 30000,
    },
    {
      id: "pos-2",
      portfolioId: "port-1",
      assetId: "asset-gld",
      asset: baseAssets[1],
      quantity: 50,
      avgPrice: 200,
      exposureUsd: 10000,
    },
  ];

  const basePortfolio = {
    id: "port-1",
    userId: "user-1",
    name: "Test Portfolio",
    initialCapital: 10000,
    positions: basePositions,
  };

  beforeEach(() => {
    mockPrisma = {
      portfolio: { findUnique: jest.fn() },
      monthlyContribution: { create: jest.fn() },
      metricsTimeseries: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
      },
      dailyMetric: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
      assetPrice: { findFirst: jest.fn() },
    };

    service = new ContributionsService(mockPrisma);
  });

  function setupDefaultMocks(overrides: {
    portfolio?: any;
    latestDailyMetric?: any;
    latestMetrics?: any;
    existingMetric?: any;
    prices?: Record<string, number>;
  } = {}) {
    mockPrisma.portfolio.findUnique.mockResolvedValue(
      overrides.portfolio ?? basePortfolio
    );

    // Use "in" check to allow explicit null
    const dailyMetric = "latestDailyMetric" in overrides
      ? overrides.latestDailyMetric
      : { equity: 15000, exposure: 40000, leverage: 2.67, peakEquity: 15500, borrowedAmount: 25000 };
    mockPrisma.dailyMetric.findFirst.mockResolvedValue(dailyMetric);

    // First call = latest metrics, Second call = for existingMetric check
    const latestMetrics = "latestMetrics" in overrides
      ? overrides.latestMetrics
      : { id: "mt-1", equity: 14500, exposure: 40000, leverage: 2.76, borrowedAmount: 25500, metadataJson: null };
    const existingMetric = "existingMetric" in overrides
      ? overrides.existingMetric
      : null;
    mockPrisma.metricsTimeseries.findFirst
      .mockResolvedValueOnce(latestMetrics)
      .mockResolvedValueOnce(existingMetric);

    // For peak equity calculation
    mockPrisma.metricsTimeseries.findMany.mockResolvedValue([]);

    const prices = overrides.prices ?? {
      "asset-spy": 500,
      "asset-gld": 200,
    };

    mockPrisma.assetPrice.findFirst.mockImplementation(({ where }: any) => {
      const price = prices[where.assetId as string];
      return Promise.resolve(price ? { close: price } : null);
    });

    mockPrisma.monthlyContribution.create.mockImplementation(
      ({ data }: any) => Promise.resolve({ id: "contrib-new", ...data })
    );

    mockPrisma.dailyMetric.upsert.mockResolvedValue({});
    mockPrisma.metricsTimeseries.upsert.mockResolvedValue({});
  }

  // ─────────────────────────────────────────────
  // recordContribution (deposit)
  // ─────────────────────────────────────────────
  describe("recordContribution (deposit)", () => {
    it("creates contribution record with deployed=true", async () => {
      setupDefaultMocks();

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
      });

      expect(mockPrisma.monthlyContribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            portfolioId: "port-1",
            amount: 1000,
            deployed: true,
            deployedAmount: 1000,
            deploymentReason: "manual",
            type: "contribution",
          }),
        })
      );
    });

    it("updates equity: newEquity = currentEquity + amount", async () => {
      setupDefaultMocks({
        latestDailyMetric: { equity: 15000, peakEquity: 15500, borrowedAmount: 25000 },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
      });

      // newEquity = 15000 + 1000 = 16000
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ equity: 16000 }),
          update: expect.objectContaining({ equity: 16000 }),
        })
      );
    });

    it("preserves borrowedAmount from latest daily metric", async () => {
      setupDefaultMocks({
        latestDailyMetric: {
          equity: 15000,
          peakEquity: 15500,
          borrowedAmount: 25000,
        },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
      });

      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ borrowedAmount: 25000 }),
        })
      );
    });

    it("upserts DailyMetric with new equity, exposure, and leverage", async () => {
      setupDefaultMocks({
        latestDailyMetric: { equity: 15000, peakEquity: 15500, borrowedAmount: 25000 },
        prices: { "asset-spy": 500, "asset-gld": 200 },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
      });

      // exposure = 60*500 + 50*200 = 40000
      // newEquity = 16000
      // leverage = 40000/16000 = 2.5
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            equity: 16000,
            exposure: 40000,
            leverage: 2.5,
          }),
        })
      );
    });

    it("upserts MetricsTimeseries with source='contribution' and metadata", async () => {
      setupDefaultMocks();

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
      });

      expect(mockPrisma.metricsTimeseries.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            portfolioId: "port-1",
          }),
        })
      );

      // Check that the metadataJson contains source and contributions
      const upsertCall = mockPrisma.metricsTimeseries.upsert.mock.calls[0][0];
      const metadata = JSON.parse(upsertCall.create.metadataJson);
      expect(metadata.source).toBe("contribution");
      expect(metadata.contributions).toHaveLength(1);
      expect(metadata.contributions[0].contributionType).toBe("contribution");
    });

    it("preserves existing metadata arrays (rebalances, manualUpdates)", async () => {
      const existingMetadata = {
        source: "rebalance",
        rebalances: ["reb-1"],
        manualUpdates: ["mu-1"],
        contributions: [{ contributionId: "old-c" }],
      };

      setupDefaultMocks({
        existingMetric: {
          id: "mt-existing",
          portfolioId: "port-1",
          date: new Date(),
          metadataJson: JSON.stringify(existingMetadata),
        },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 500,
      });

      const upsertCall = mockPrisma.metricsTimeseries.upsert.mock.calls[0][0];
      const metadata = JSON.parse(upsertCall.create.metadataJson);
      expect(metadata.rebalances).toEqual(["reb-1"]);
      expect(metadata.manualUpdates).toEqual(["mu-1"]);
      // Old contribution preserved, new one added
      expect(metadata.contributions).toHaveLength(2);
    });

    it("throws NotFoundException when portfolio not found", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(
        service.recordContribution({ portfolioId: "nonexistent", amount: 100 })
      ).rejects.toThrow(NotFoundException);
    });

    it("falls back to MetricsTimeseries equity when no DailyMetric", async () => {
      setupDefaultMocks({
        latestDailyMetric: null,
        latestMetrics: {
          id: "mt-1",
          equity: 12000,
          borrowedAmount: 28000,
          metadataJson: null,
        },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 500,
      });

      // newEquity = 12000 + 500 = 12500
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ equity: 12500 }),
        })
      );
    });

    it("falls back to initialCapital when no metrics exist", async () => {
      setupDefaultMocks({
        latestDailyMetric: null,
        latestMetrics: null,
        existingMetric: null,
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 500,
      });

      // newEquity = initialCapital(10000) + 500 = 10500
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ equity: 10500 }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────
  // recordContribution (withdrawal)
  // ─────────────────────────────────────────────
  describe("recordContribution (withdrawal)", () => {
    it("creates withdrawal record with type='withdrawal'", async () => {
      setupDefaultMocks();

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 2000,
        type: "withdrawal",
      });

      expect(mockPrisma.monthlyContribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "withdrawal",
            deploymentReason: "withdrawal",
          }),
        })
      );
    });

    it("decreases equity: newEquity = currentEquity - amount", async () => {
      setupDefaultMocks({
        latestDailyMetric: { equity: 15000, peakEquity: 15500, borrowedAmount: 25000 },
      });

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 3000,
        type: "withdrawal",
      });

      // newEquity = 15000 - 3000 = 12000
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ equity: 12000 }),
        })
      );
    });

    it("throws BadRequestException when withdrawal > current equity", async () => {
      setupDefaultMocks({
        latestDailyMetric: { equity: 5000, peakEquity: 15000, borrowedAmount: 25000 },
      });

      await expect(
        service.recordContribution({
          portfolioId: "port-1",
          amount: 10000,
          type: "withdrawal",
        })
      ).rejects.toThrow(BadRequestException);
    });

    it("sets deploymentReason to 'withdrawal'", async () => {
      setupDefaultMocks();

      await service.recordContribution({
        portfolioId: "port-1",
        amount: 1000,
        type: "withdrawal",
      });

      expect(mockPrisma.monthlyContribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deploymentReason: "withdrawal",
          }),
        })
      );
    });
  });
});
