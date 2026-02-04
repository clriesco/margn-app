import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateStrategyDto } from './dto/create-strategy.dto';

@Injectable()
export class StrategiesService {
  private readonly logger = new Logger(StrategiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateStrategyDto) {
    const strategy = await this.prisma.savedStrategy.create({
      data: {
        userId,
        name: dto.name,
        configJson: JSON.stringify(dto.config),
        metricsJson: JSON.stringify(dto.metrics),
        trajectoriesJson: JSON.stringify(dto.trajectories),
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
      const metrics = JSON.parse(s.metricsJson);

      return {
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        config: {
          symbols: config.symbols,
          weights: config.weights,
          leverageTarget: config.leverageTarget,
          weightMode: config.weightMode,
          dynamicWeights: config.dynamicWeights,
        },
        metrics: {
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
        },
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

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    return {
      id: strategy.id,
      name: strategy.name,
      createdAt: strategy.createdAt,
      config: JSON.parse(strategy.configJson),
      metrics: JSON.parse(strategy.metricsJson),
      trajectories: JSON.parse(strategy.trajectoriesJson),
    };
  }

  async updateName(userId: string, strategyId: string, name: string) {
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    const updated = await this.prisma.savedStrategy.update({
      where: { id: strategyId },
      data: { name },
    });

    return { id: updated.id, name: updated.name };
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

  async applyToPortfolio(
    userId: string,
    strategyId: string,
    portfolioId: string,
  ) {
    // Get strategy
    const strategy = await this.prisma.savedStrategy.findUnique({
      where: { id: strategyId },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    if (strategy.userId !== userId) {
      throw new ForbiddenException('You do not own this strategy');
    }

    // Get portfolio
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: { positions: { include: { asset: true } } },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    if (portfolio.userId !== userId) {
      throw new ForbiddenException('You do not own this portfolio');
    }

    const config = JSON.parse(strategy.configJson);
    const weights = config.weights as Record<string, number>;
    const symbols = Object.keys(weights);

    // Find existing position symbols
    const existingSymbols = new Set(
      portfolio.positions.map((p) => p.asset.symbol),
    );

    // Find symbols that need to be added
    const newSymbols = symbols.filter((s) => !existingSymbols.has(s));

    // For new symbols, we need to:
    // 1. Create or find the asset
    // 2. Create a position with quantity 0
    const addedAssets: string[] = [];

    for (const symbol of newSymbols) {
      // Find or create asset
      let asset = await this.prisma.asset.findUnique({
        where: { symbol },
      });

      if (!asset) {
        // Create basic asset record - the onboarding or position service
        // will fetch full details and historical prices
        asset = await this.prisma.asset.create({
          data: {
            symbol,
            name: symbol, // Will be updated later
            assetType: this.guessAssetType(symbol),
          },
        });
        this.logger.log(`Created new asset: ${symbol}`);
      }

      // Create position with quantity 0
      await this.prisma.portfolioPosition.create({
        data: {
          portfolioId,
          assetId: asset.id,
          quantity: 0,
          avgPrice: 0,
          exposureUsd: 0,
        },
      });

      addedAssets.push(symbol);
      this.logger.log(`Created position for ${symbol} in portfolio ${portfolioId}`);
    }

    // Update target weights
    await this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        targetWeightsJson: JSON.stringify(weights),
      },
    });

    this.logger.log(
      `Applied strategy ${strategyId} to portfolio ${portfolioId}. Added ${addedAssets.length} new assets.`,
    );

    return {
      success: true,
      addedAssets,
      updatedWeights: weights,
      message:
        addedAssets.length > 0
          ? `Estrategia aplicada. Se añadieron ${addedAssets.length} activo(s): ${addedAssets.join(', ')}. Redirigiendo a Rebalanceo...`
          : 'Estrategia aplicada. Pesos objetivo actualizados. Redirigiendo a Rebalanceo...',
    };
  }

  private guessAssetType(symbol: string): string {
    if (symbol.includes('-USD') || symbol.includes('BTC') || symbol.includes('ETH')) {
      return 'crypto';
    }
    if (symbol === 'GLD' || symbol === 'SLV' || symbol === 'USO') {
      return 'commodity';
    }
    if (symbol === 'TLT' || symbol === 'IEF' || symbol === 'SHY') {
      return 'bond';
    }
    return 'stock';
  }
}
