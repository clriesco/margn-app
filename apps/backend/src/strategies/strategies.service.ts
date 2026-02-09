import { detectRiskProfile } from '@leveraged-dca/shared';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { OnboardingService } from '../portfolios/onboarding.service';
import { PrismaService } from '../prisma/prisma.service';

import { CreatePortfolioFromStrategyDto } from './dto/create-portfolio-from-strategy.dto';
import { CreateStrategyDto } from './dto/create-strategy.dto';

@Injectable()
export class StrategiesService {
  private readonly logger = new Logger(StrategiesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboardingService: OnboardingService,
  ) {}

  async create(userId: string, dto: CreateStrategyDto) {
    const config = dto.config;
    const riskProfileId = detectRiskProfile({
      leverageMin: config.leverageMin,
      leverageMax: config.leverageMax,
      leverageTarget: config.leverageTarget,
    });

    const strategy = await this.prisma.savedStrategy.create({
      data: {
        userId,
        name: dto.name,
        configJson: JSON.stringify(dto.config),
        metricsJson: JSON.stringify(dto.metrics),
        trajectoriesJson: JSON.stringify(dto.trajectories),
        description: dto.description || null,
        riskProfileId,
        isPublic: dto.isPublic ?? false,
      },
    });

    return {
      id: strategy.id,
      name: strategy.name,
      createdAt: strategy.createdAt,
    };
  }

  async findAllByUser(userId: string) {
    const strategies = await this.prisma.savedStrategy.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
    });

    return strategies.map((s) => {
      const config = JSON.parse(s.configJson);
      const metrics = s.metricsJson ? JSON.parse(s.metricsJson) : null;

      return {
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        isPublic: s.isPublic,
        riskProfileId: s.riskProfileId,
        description: s.description,
        config: {
          symbols: config.symbols,
          weights: config.weights,
          leverageTarget: config.leverageTarget,
          weightMode: config.weightMode,
          dynamicWeights: config.dynamicWeights,
        },
        metrics: metrics
          ? {
              p10: {
                finalCapital: metrics.p10.finalCapital,
                cagr: metrics.p10.cagr,
                sharpe: metrics.p10.sharpe,
                maxDrawdownEquity: metrics.p10.maxDrawdownEquity,
              },
              p50: {
                finalCapital: metrics.p50.finalCapital,
                cagr: metrics.p50.cagr,
                sharpe: metrics.p50.sharpe,
                maxDrawdownEquity: metrics.p50.maxDrawdownEquity,
              },
              p90: {
                finalCapital: metrics.p90.finalCapital,
                cagr: metrics.p90.cagr,
                sharpe: metrics.p90.sharpe,
                maxDrawdownEquity: metrics.p90.maxDrawdownEquity,
              },
              totalWindows: metrics.totalWindows,
              marginCallCount: metrics.marginCallCount,
              ...(metrics.score ? { score: metrics.score } : {}),
            }
          : null,
      };
    });
  }

  async findAllPublic(filters?: {
    riskProfileId?: string;
    type?: 'platform' | 'community';
    excludeUserId?: string;
  }) {
    const where: Record<string, unknown> = { isPublic: true };

    if (filters?.riskProfileId) {
      where.riskProfileId = filters.riskProfileId;
    }

    if (filters?.type === 'platform') {
      where.isPlatform = true;
    } else if (filters?.type === 'community') {
      where.isPlatform = false;
      // Exclude the current user's own strategies from community tab
      if (filters?.excludeUserId) {
        where.userId = { not: filters.excludeUserId };
      }
    }

    const strategies = await this.prisma.savedStrategy.findMany({
      where,
      orderBy: [{ isPlatform: 'desc' }, { name: 'asc' }],
      include: {
        user: { select: { fullName: true } },
      },
    });

    return strategies.map((s) => {
      const config = JSON.parse(s.configJson);
      const metrics = s.metricsJson ? JSON.parse(s.metricsJson) : null;

      return {
        id: s.id,
        name: s.name,
        description: s.description,
        isPlatform: s.isPlatform,
        riskProfileId: s.riskProfileId,
        authorName: s.user?.fullName || null,
        config: {
          symbols: config.symbols,
          weights: config.weights,
          leverageTarget: config.leverageTarget,
          weightMode: config.weightMode,
          dynamicWeights: config.dynamicWeights,
        },
        metrics: metrics
          ? {
              p50: {
                finalCapital: metrics.p50.finalCapital,
                cagr: metrics.p50.cagr,
                sharpe: metrics.p50.sharpe,
                maxDrawdownEquity: metrics.p50.maxDrawdownEquity,
              },
              ...(metrics.score ? { score: metrics.score } : {}),
            }
          : null,
      };
    });
  }

  async findOne(userId: string, strategyId: string) {
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId && !strategy.isPublic) {
      throw new ForbiddenException('You do not own this strategy');
    }

    return {
      id: strategy.id,
      name: strategy.name,
      createdAt: strategy.createdAt,
      isPublic: strategy.isPublic,
      isPlatform: strategy.isPlatform,
      riskProfileId: strategy.riskProfileId,
      description: strategy.description,
      aiAnalysis: strategy.aiAnalysis || null,
      isOwner: strategy.userId === userId,
      config: JSON.parse(strategy.configJson),
      metrics: strategy.metricsJson
        ? JSON.parse(strategy.metricsJson)
        : null,
      trajectories: strategy.trajectoriesJson
        ? JSON.parse(strategy.trajectoriesJson)
        : null,
    };
  }

  async update(
    userId: string,
    strategyId: string,
    fields: { name?: string; description?: string },
  ) {
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    const data: Record<string, string> = {};
    if (fields.name !== undefined) data.name = fields.name;
    if (fields.description !== undefined) data.description = fields.description;

    const updated = await this.prisma.savedStrategy.update({
      where: { id: strategyId },
      data,
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
    };
  }

  async updateVisibility(
    userId: string,
    strategyId: string,
    isPublic: boolean,
  ) {
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    if (strategy.isPlatform) {
      throw new ForbiddenException('Cannot change visibility of platform strategies');
    }

    // Auto-detect riskProfileId when making public
    let riskProfileId = strategy.riskProfileId;
    if (isPublic && !riskProfileId) {
      const config = JSON.parse(strategy.configJson);
      riskProfileId = detectRiskProfile({
        leverageMin: config.leverageMin,
        leverageMax: config.leverageMax,
        leverageTarget: config.leverageTarget,
      });
    }

    const updated = await this.prisma.savedStrategy.update({
      where: { id: strategyId },
      data: { isPublic, riskProfileId },
    });

    return { id: updated.id, isPublic: updated.isPublic };
  }

  async delete(userId: string, strategyId: string) {
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    await this.prisma.savedStrategy.delete({
      where: { id: strategyId },
    });

    return { success: true };
  }

  async createPortfolioFromStrategy(
    userId: string,
    strategyId: string,
    dto: CreatePortfolioFromStrategyDto,
  ) {
    // Get strategy
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId && !strategy.isPublic) {
      throw new ForbiddenException('You do not have access to this strategy');
    }

    const config = JSON.parse(strategy.configJson);
    const weights = config.weights as Record<string, number>;
    const symbols = Object.keys(weights);

    // Map strategy config to onboarding DTO
    const result = await this.onboardingService.createPortfolioWithAssets(
      userId,
      {
        name: dto.name,
        initialCapital: dto.initialCapital,
        assets: symbols.map((symbol) => ({ symbol })),
        weightAllocationMethod: 'manual',
        targetWeights: weights,
        leverageMin: config.leverageMin,
        leverageMax: config.leverageMax,
        leverageTarget: config.leverageTarget,
        monthlyContribution: dto.monthlyContribution,
      },
    );

    this.logger.log(
      `Created portfolio from strategy ${strategyId}: ${result.portfolio.id}`,
    );

    return {
      portfolioId: result.portfolio.id,
      name: result.portfolio.name,
    };
  }
}
