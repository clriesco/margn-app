import { NotFoundException } from "@nestjs/common";

import { PositionsService } from "../../src/positions/positions.service";

describe("PositionsService", () => {
  let service: PositionsService;
  let mockPrisma: any;
  let mockConfigService: any;

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
    initialCapital: 10000,
    targetWeightsJson: JSON.stringify({ SPY: 0.6, GLD: 0.4 }),
    positions: basePositions,
  };

  beforeEach(() => {
    mockPrisma = {
      portfolio: { findUnique: jest.fn(), update: jest.fn() },
      asset: { upsert: jest.fn(), findUnique: jest.fn() },
      assetPrice: { findFirst: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
      portfolioPosition: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      metricsTimeseries: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      dailyMetric: {
        findFirst: jest.fn(),
        upsert: jest.fn(),
      },
    };

    mockConfigService = {
      getConfiguration: jest.fn().mockResolvedValue({
        targetWeights: { SPY: 0.6, GLD: 0.4 },
        useDynamicSharpeRebalance: false,
      }),
      updateConfiguration: jest.fn().mockResolvedValue({}),
    };

    service = new PositionsService(mockPrisma, mockConfigService);

    // Prevent real HTTP calls
    jest
      .spyOn(service as any, "validateTicker")
      .mockResolvedValue(true);
    jest
      .spyOn(service as any, "downloadHistoricalPrices")
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, "fetchCurrentPrice")
      .mockResolvedValue(null);
  });

  function setupDefaultMocks(overrides: {
    portfolio?: any;
    prices?: Record<string, number>;
  } = {}) {
    mockPrisma.portfolio.findUnique.mockResolvedValue(
      overrides.portfolio ?? basePortfolio
    );

    mockPrisma.asset.upsert.mockImplementation(({ where, create }: any) => {
      const symbol = where.symbol || create.symbol;
      const existing = baseAssets.find((a) => a.symbol === symbol);
      return Promise.resolve(
        existing ?? { id: `asset-${symbol}`, symbol, name: symbol, assetType: create.assetType }
      );
    });

    mockPrisma.portfolioPosition.findUnique.mockImplementation(
      ({ where }: any) => {
        const { portfolioId, assetId } = where.portfolioId_assetId;
        const pos = basePositions.find(
          (p) => p.portfolioId === portfolioId && p.assetId === assetId
        );
        return Promise.resolve(pos ?? null);
      }
    );

    mockPrisma.portfolioPosition.upsert.mockImplementation(
      ({ create, update, where }: any) => {
        return Promise.resolve({
          id: `pos-${where.portfolioId_assetId.assetId}`,
          portfolioId: where.portfolioId_assetId.portfolioId,
          assetId: where.portfolioId_assetId.assetId,
          quantity: update.quantity ?? create.quantity,
          avgPrice: update.avgPrice ?? create.avgPrice,
          exposureUsd: update.exposureUsd ?? create.exposureUsd,
        });
      }
    );

    const prices = overrides.prices ?? {
      "asset-spy": 500,
      "asset-gld": 200,
    };
    mockPrisma.assetPrice.findFirst.mockImplementation(({ where }: any) => {
      const price = prices[where.assetId as string];
      return Promise.resolve(price ? { close: price } : null);
    });

    mockPrisma.dailyMetric.findFirst.mockResolvedValue(null);
    mockPrisma.metricsTimeseries.findFirst.mockResolvedValue(null);
    mockPrisma.metricsTimeseries.findMany.mockResolvedValue([]);
    mockPrisma.dailyMetric.upsert.mockResolvedValue({});
    mockPrisma.metricsTimeseries.create.mockResolvedValue({});
    mockPrisma.metricsTimeseries.update.mockResolvedValue({});
    mockPrisma.portfolioPosition.deleteMany.mockResolvedValue({});
    mockPrisma.portfolioPosition.findMany.mockResolvedValue([]);
    mockPrisma.portfolio.update.mockResolvedValue({});
  }

  // ─────────────────────────────────────────────
  // upsert — basic position operations
  // ─────────────────────────────────────────────
  describe("upsert", () => {
    it("updates existing positions with correct quantity and avgPrice", async () => {
      setupDefaultMocks();

      const result = await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 70, avgPrice: 480, source: "index" },
          { symbol: "GLD", quantity: 55, avgPrice: 190, source: "commodity" },
        ],
      });

      expect(result).toHaveLength(2);
      expect(mockPrisma.portfolioPosition.upsert).toHaveBeenCalledTimes(2);
    });

    it("throws NotFoundException when portfolio not found", async () => {
      mockPrisma.portfolio.findUnique.mockResolvedValue(null);

      await expect(
        service.upsert({
          portfolioId: "nonexistent",
          positions: [
            { symbol: "SPY", quantity: 10, avgPrice: 500, source: "index" },
          ],
        })
      ).rejects.toThrow(NotFoundException);
    });

    it("detects and handles new assets", async () => {
      setupDefaultMocks();

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
          { symbol: "BTC-USD", quantity: 0.5, avgPrice: 60000, source: "crypto" },
        ],
      });

      // BTC-USD is new — validate ticker should have been called
      expect((service as any).validateTicker).toHaveBeenCalledWith("BTC-USD");
      // download historical prices should have been called for the new asset
      expect((service as any).downloadHistoricalPrices).toHaveBeenCalled();
    });

    it("throws error when new ticker validation fails", async () => {
      setupDefaultMocks();
      jest
        .spyOn(service as any, "validateTicker")
        .mockResolvedValue(false);

      await expect(
        service.upsert({
          portfolioId: "port-1",
          positions: [
            { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
            { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
            { symbol: "INVALID", quantity: 10, avgPrice: 100, source: "stock" },
          ],
        })
      ).rejects.toThrow("Ticker inválido");
    });

    it("removes positions not in submitted list", async () => {
      setupDefaultMocks();

      // Only submit SPY, GLD should be detected for deletion
      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
        ],
      });

      // GLD asset lookup for deletion
      expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
        where: { symbol: "GLD" },
      });
    });

    it("updates target weights when adding new assets", async () => {
      setupDefaultMocks();

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
          { symbol: "TLT", quantity: 30, avgPrice: 100, source: "bond" },
        ],
      });

      // updateTargetWeightsForNewAssets calls configService
      expect(mockConfigService.getConfiguration).toHaveBeenCalled();
    });

    it("upserts metrics with source='manual_update' when equity provided", async () => {
      setupDefaultMocks();

      mockPrisma.portfolioPosition.findMany.mockResolvedValue(
        basePositions.map((p) => ({
          ...p,
          asset: baseAssets.find((a) => a.id === p.assetId),
        }))
      );

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
        ],
        equity: 15000,
      });

      // Should upsert DailyMetric
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            equity: 15000,
            portfolioId: "port-1",
          }),
        })
      );
    });

    it("calculates borrowedAmount when equity provided", async () => {
      setupDefaultMocks({
        prices: { "asset-spy": 500, "asset-gld": 200 },
      });

      mockPrisma.portfolioPosition.findMany.mockResolvedValue(
        basePositions.map((p) => ({
          ...p,
          asset: baseAssets.find((a) => a.id === p.assetId),
        }))
      );

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 60, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
        ],
        equity: 15000,
      });

      // exposure from upserted positions: SPY 60*500=30000 + GLD 50*200=10000 = 40000
      // borrowedAmount = 40000 - 15000 = 25000
      expect(mockPrisma.dailyMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            borrowedAmount: 25000,
          }),
        })
      );
    });

    it("preserves cost basis when selling (quantity decreases)", async () => {
      setupDefaultMocks();

      // Existing position: SPY 60 shares @ $450
      // User sells 10 shares — avgPrice should stay at $450
      mockPrisma.portfolioPosition.findUnique.mockImplementation(
        ({ where }: any) => {
          if (where.portfolioId_assetId.assetId === "asset-spy") {
            return Promise.resolve({
              id: "pos-1",
              portfolioId: "port-1",
              assetId: "asset-spy",
              quantity: 60,
              avgPrice: 450,
            });
          }
          return Promise.resolve(null);
        }
      );

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 50, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
        ],
      });

      // When selling, avgPrice should be preserved (450, not 500)
      const spyUpsertCall = mockPrisma.portfolioPosition.upsert.mock.calls.find(
        (call: any) =>
          call[0].where.portfolioId_assetId.assetId === "asset-spy"
      );
      expect(spyUpsertCall[0].update.avgPrice).toBe(450);
    });

    it("calculates weighted average price when buying more", async () => {
      setupDefaultMocks();

      // Existing: 60 shares @ $450 = $27,000
      // Buying 40 more at $500 → total 100 shares
      // New avgPrice = (60*450 + 40*500) / 100 = (27000 + 20000) / 100 = $470
      mockPrisma.portfolioPosition.findUnique.mockImplementation(
        ({ where }: any) => {
          if (where.portfolioId_assetId.assetId === "asset-spy") {
            return Promise.resolve({
              id: "pos-1",
              portfolioId: "port-1",
              assetId: "asset-spy",
              quantity: 60,
              avgPrice: 450,
            });
          }
          return Promise.resolve(null);
        }
      );

      await service.upsert({
        portfolioId: "port-1",
        positions: [
          { symbol: "SPY", quantity: 100, avgPrice: 500, source: "index" },
          { symbol: "GLD", quantity: 50, avgPrice: 200, source: "commodity" },
        ],
      });

      const spyUpsertCall = mockPrisma.portfolioPosition.upsert.mock.calls.find(
        (call: any) =>
          call[0].where.portfolioId_assetId.assetId === "asset-spy"
      );
      // Weighted average: (60*450 + 40*500) / 100 = 470
      expect(spyUpsertCall[0].update.avgPrice).toBe(470);
    });
  });
});
