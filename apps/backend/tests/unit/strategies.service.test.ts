import {
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { StrategiesService } from "../../src/strategies/strategies.service";

describe("StrategiesService", () => {
  let service: StrategiesService;
  let mockPrisma: any;

  const userId = "user-1";
  const otherUserId = "user-2";

  const sampleConfig = {
    symbols: ["SPY", "GLD", "BTC-USD"],
    initialCapital: 10000,
    monthlyContribution: 1000,
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    windowMonths: 60,
    weights: { SPY: 0.6, GLD: 0.25, "BTC-USD": 0.15 },
    weightMode: "sharpe",
    dynamicWeights: true,
  };

  const sampleMetrics = {
    p10: { finalCapital: 50000, cagr: 0.15, sharpe: 1.2, maxDrawdownEquity: -0.2 },
    p50: { finalCapital: 80000, cagr: 0.25, sharpe: 1.8, maxDrawdownEquity: -0.15 },
    p90: { finalCapital: 120000, cagr: 0.35, sharpe: 2.1, maxDrawdownEquity: -0.1 },
    totalWindows: 48,
    marginCallCount: 0,
    score: { composite: 85, dimensions: { dispersion: 90, worstCase: 80, sharpe: 85, drawdown: 88 }, marginCallPenalty: false },
  };

  const sampleTrajectories = {
    p10: { points: [{ date: "2024-01-01", equity: 10000 }] },
    p50: { points: [{ date: "2024-01-01", equity: 10000 }] },
    p90: { points: [{ date: "2024-01-01", equity: 10000 }] },
  };

  const sampleStrategy = {
    id: "strat-1",
    userId,
    name: "Growth Strategy",
    description: "My growth strategy",
    configJson: JSON.stringify(sampleConfig),
    metricsJson: JSON.stringify(sampleMetrics),
    trajectoriesJson: JSON.stringify(sampleTrajectories),
    isPublic: false,
    isPlatform: false,
    riskProfileId: "growth",
    aiAnalysis: null,
    createdAt: new Date("2024-06-01"),
  };

  let mockOnboardingService: any;

  beforeEach(() => {
    mockPrisma = {
      savedStrategy: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    mockOnboardingService = {
      createPortfolioWithAssets: jest.fn(),
    };

    service = new StrategiesService(mockPrisma, mockOnboardingService);
  });

  // ─────────────────────────────────────────────
  // create
  // ─────────────────────────────────────────────
  describe("create", () => {
    it("creates strategy with correct data", async () => {
      mockPrisma.savedStrategy.create.mockResolvedValue({
        id: "strat-new",
        name: "My Strategy",
        createdAt: new Date(),
      });

      const result = await service.create(userId, {
        name: "My Strategy",
        config: sampleConfig as any,
        metrics: sampleMetrics as any,
        trajectories: sampleTrajectories as any,
        description: "A description",
        isPublic: true,
      });

      expect(result.id).toBe("strat-new");
      expect(mockPrisma.savedStrategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          name: "My Strategy",
          description: "A description",
          isPublic: true,
          riskProfileId: "growth", // detected from leverageMin=2.5, max=4.0, target=3.0
        }),
      });

      // Verify JSON serialization
      const createCall = mockPrisma.savedStrategy.create.mock.calls[0][0];
      expect(JSON.parse(createCall.data.configJson)).toEqual(sampleConfig);
      expect(JSON.parse(createCall.data.metricsJson)).toEqual(sampleMetrics);
    });

    it("detects risk profile from leverage params", async () => {
      mockPrisma.savedStrategy.create.mockResolvedValue({
        id: "strat-new",
        name: "Conservative",
        createdAt: new Date(),
      });

      const conservativeConfig = {
        ...sampleConfig,
        leverageMin: 1.5,
        leverageMax: 2.0,
        leverageTarget: 1.75,
      };

      await service.create(userId, {
        name: "Conservative",
        config: conservativeConfig as any,
        metrics: sampleMetrics as any,
        trajectories: sampleTrajectories as any,
      });

      expect(mockPrisma.savedStrategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          riskProfileId: "conservative",
        }),
      });
    });

    it("sets riskProfileId to null for custom leverage params", async () => {
      mockPrisma.savedStrategy.create.mockResolvedValue({
        id: "strat-new",
        name: "Custom",
        createdAt: new Date(),
      });

      const customConfig = {
        ...sampleConfig,
        leverageMin: 1.0,
        leverageMax: 2.5,
        leverageTarget: 1.5,
      };

      await service.create(userId, {
        name: "Custom",
        config: customConfig as any,
        metrics: sampleMetrics as any,
        trajectories: sampleTrajectories as any,
      });

      expect(mockPrisma.savedStrategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          riskProfileId: null,
        }),
      });
    });
  });

  // ─────────────────────────────────────────────
  // findAllByUser
  // ─────────────────────────────────────────────
  describe("findAllByUser", () => {
    it("returns user strategies with parsed config and metrics", async () => {
      mockPrisma.savedStrategy.findMany.mockResolvedValue([sampleStrategy]);

      const result = await service.findAllByUser(userId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("strat-1");
      expect(result[0].config.symbols).toEqual(["SPY", "GLD", "BTC-USD"]);
      expect(result[0].metrics?.p50.finalCapital).toBe(80000);
    });

    it("returns empty array when user has no strategies", async () => {
      mockPrisma.savedStrategy.findMany.mockResolvedValue([]);

      const result = await service.findAllByUser(userId);

      expect(result).toEqual([]);
    });
  });

  // ─────────────────────────────────────────────
  // findAllPublic
  // ─────────────────────────────────────────────
  describe("findAllPublic", () => {
    it("returns only public strategies", async () => {
      const publicStrategy = {
        ...sampleStrategy,
        isPublic: true,
        user: { fullName: "Test User" },
      };
      mockPrisma.savedStrategy.findMany.mockResolvedValue([publicStrategy]);

      const result = await service.findAllPublic();

      expect(result).toHaveLength(1);
      expect(mockPrisma.savedStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublic: true },
        })
      );
    });

    it("filters by riskProfileId", async () => {
      mockPrisma.savedStrategy.findMany.mockResolvedValue([]);

      await service.findAllPublic({ riskProfileId: "growth" });

      expect(mockPrisma.savedStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublic: true,
            riskProfileId: "growth",
          }),
        })
      );
    });

    it("filters platform vs community", async () => {
      mockPrisma.savedStrategy.findMany.mockResolvedValue([]);

      await service.findAllPublic({ type: "platform" });

      expect(mockPrisma.savedStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPublic: true,
            isPlatform: true,
          }),
        })
      );
    });

    it("excludes user's own strategies from community tab", async () => {
      mockPrisma.savedStrategy.findMany.mockResolvedValue([]);

      await service.findAllPublic({
        type: "community",
        excludeUserId: userId,
      });

      expect(mockPrisma.savedStrategy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isPlatform: false,
            userId: { not: userId },
          }),
        })
      );
    });
  });

  // ─────────────────────────────────────────────
  // findOne
  // ─────────────────────────────────────────────
  describe("findOne", () => {
    it("returns full strategy with parsed JSON fields for owner", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);

      const result = await service.findOne(userId, "strat-1");

      expect(result.id).toBe("strat-1");
      expect(result.isOwner).toBe(true);
      expect(result.config).toEqual(sampleConfig);
      expect(result.metrics).toEqual(sampleMetrics);
      expect(result.trajectories).toEqual(sampleTrajectories);
    });

    it("returns strategy for non-owner when isPublic=true", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPublic: true,
      });

      const result = await service.findOne(otherUserId, "strat-1");

      expect(result.isOwner).toBe(false);
      expect(result.id).toBe("strat-1");
    });

    it("throws NotFoundException when strategy doesn't exist", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne(userId, "nonexistent")
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException when non-owner accesses private strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPublic: false,
      });

      await expect(
        service.findOne(otherUserId, "strat-1")
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // update
  // ─────────────────────────────────────────────
  describe("update", () => {
    it("updates name and description", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);
      mockPrisma.savedStrategy.update.mockResolvedValue({
        id: "strat-1",
        name: "Updated Name",
        description: "Updated description",
      });

      const result = await service.update(userId, "strat-1", {
        name: "Updated Name",
        description: "Updated description",
      });

      expect(result.name).toBe("Updated Name");
      expect(mockPrisma.savedStrategy.update).toHaveBeenCalledWith({
        where: { id: "strat-1" },
        data: { name: "Updated Name", description: "Updated description" },
      });
    });

    it("throws NotFoundException for missing strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(null);

      await expect(
        service.update(userId, "nonexistent", { name: "test" })
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for non-owner", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);

      await expect(
        service.update(otherUserId, "strat-1", { name: "test" })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // updateVisibility
  // ─────────────────────────────────────────────
  describe("updateVisibility", () => {
    it("toggles isPublic", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);
      mockPrisma.savedStrategy.update.mockResolvedValue({
        id: "strat-1",
        isPublic: true,
      });

      const result = await service.updateVisibility(userId, "strat-1", true);

      expect(result.isPublic).toBe(true);
    });

    it("auto-detects riskProfileId when making public", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        riskProfileId: null,
      });
      mockPrisma.savedStrategy.update.mockResolvedValue({
        id: "strat-1",
        isPublic: true,
      });

      await service.updateVisibility(userId, "strat-1", true);

      expect(mockPrisma.savedStrategy.update).toHaveBeenCalledWith({
        where: { id: "strat-1" },
        data: { isPublic: true, riskProfileId: "growth" }, // Detected from config
      });
    });

    it("throws ForbiddenException for platform strategies", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPlatform: true,
      });

      await expect(
        service.updateVisibility(userId, "strat-1", false)
      ).rejects.toThrow(ForbiddenException);
    });

    it("throws ForbiddenException for non-owner", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);

      await expect(
        service.updateVisibility(otherUserId, "strat-1", true)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // delete
  // ─────────────────────────────────────────────
  describe("delete", () => {
    it("deletes strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);
      mockPrisma.savedStrategy.delete.mockResolvedValue({});

      const result = await service.delete(userId, "strat-1");

      expect(result).toEqual({ success: true });
      expect(mockPrisma.savedStrategy.delete).toHaveBeenCalledWith({
        where: { id: "strat-1" },
      });
    });

    it("throws NotFoundException for missing strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(null);

      await expect(
        service.delete(userId, "nonexistent")
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for non-owner", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(sampleStrategy);

      await expect(
        service.delete(otherUserId, "strat-1")
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─────────────────────────────────────────────
  // createPortfolioFromStrategy
  // ─────────────────────────────────────────────
  describe("createPortfolioFromStrategy", () => {
    const createDto = {
      name: "New Growth Portfolio",
      initialCapital: 15000,
      monthlyContribution: 500,
    };

    it("creates portfolio via onboarding service with strategy config", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPublic: true,
      });
      mockOnboardingService.createPortfolioWithAssets.mockResolvedValue({
        portfolio: { id: "new-port-1", name: "New Growth Portfolio" },
      });

      const result = await service.createPortfolioFromStrategy(userId, "strat-1", createDto);

      expect(result.portfolioId).toBe("new-port-1");
      expect(result.name).toBe("New Growth Portfolio");
      expect(mockOnboardingService.createPortfolioWithAssets).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          name: "New Growth Portfolio",
          initialCapital: 15000,
          monthlyContribution: 500,
          assets: expect.arrayContaining([
            { symbol: "SPY" },
            { symbol: "GLD" },
            { symbol: "BTC-USD" },
          ]),
          weightAllocationMethod: "manual",
          targetWeights: sampleConfig.weights,
          leverageMin: sampleConfig.leverageMin,
          leverageMax: sampleConfig.leverageMax,
          leverageTarget: sampleConfig.leverageTarget,
        }),
      );
    });

    it("allows owner to create portfolio from their own private strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPublic: false,
      });
      mockOnboardingService.createPortfolioWithAssets.mockResolvedValue({
        portfolio: { id: "new-port-2", name: "My Portfolio" },
      });

      const result = await service.createPortfolioFromStrategy(userId, "strat-1", createDto);

      expect(result.portfolioId).toBe("new-port-2");
    });

    it("allows non-owner to create portfolio from public strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        isPublic: true,
      });
      mockOnboardingService.createPortfolioWithAssets.mockResolvedValue({
        portfolio: { id: "new-port-3", name: "New Growth Portfolio" },
      });

      const result = await service.createPortfolioFromStrategy(otherUserId, "strat-1", createDto);

      expect(result.portfolioId).toBe("new-port-3");
      expect(mockOnboardingService.createPortfolioWithAssets).toHaveBeenCalledWith(
        otherUserId,
        expect.anything(),
      );
    });

    it("throws NotFoundException for missing strategy", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue(null);

      await expect(
        service.createPortfolioFromStrategy(userId, "nonexistent", createDto)
      ).rejects.toThrow(NotFoundException);
    });

    it("throws ForbiddenException for private strategy owned by another user", async () => {
      mockPrisma.savedStrategy.findUnique.mockResolvedValue({
        ...sampleStrategy,
        userId: otherUserId,
        isPublic: false,
      });

      await expect(
        service.createPortfolioFromStrategy(userId, "strat-1", createDto)
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
