import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * DTO for adding/updating a target asset
 */
export interface UpsertTargetAssetDto {
  symbol: string;
  targetWeight?: number; // Optional - will be auto-calculated if not provided
  enabled?: boolean;
}

/**
 * DTO for bulk update of target assets
 */
export interface BulkUpdateTargetAssetsDto {
  assets: Array<{
    symbol: string;
    targetWeight: number;
    enabled?: boolean;
  }>;
}

/**
 * Response for a target asset
 */
export interface TargetAssetResponse {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  targetWeight: number;
  enabled: boolean;
  hasPosition: boolean; // Whether there's an actual holding
  currentQuantity: number | null; // Current quantity if position exists
  currentValue: number | null; // Current value if position exists
}

/**
 * Service for managing portfolio target assets
 *
 * This service handles the "what do I want to hold" aspect of the portfolio,
 * separate from "what do I actually hold" (PortfolioPosition).
 */
@Injectable()
export class TargetAssetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all target assets for a portfolio
   */
  async getTargetAssets(portfolioId: string): Promise<TargetAssetResponse[]> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        targetAssets: {
          include: {
            asset: true,
          },
          orderBy: { targetWeight: 'desc' },
        },
        positions: {
          include: {
            asset: {
              include: {
                prices: {
                  orderBy: { date: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException(`Portfolio ${portfolioId} not found`);
    }

    // Build a map of positions for quick lookup
    const positionMap = new Map(
      portfolio.positions.map(p => [p.assetId, p])
    );

    return portfolio.targetAssets.map(ta => {
      const position = positionMap.get(ta.assetId);
      const latestPrice = position?.asset.prices[0]?.close;
      const currentValue = position && latestPrice ? position.quantity * latestPrice : null;

      return {
        id: ta.id,
        symbol: ta.asset.symbol,
        name: ta.asset.name,
        assetType: ta.asset.assetType,
        targetWeight: ta.targetWeight,
        enabled: ta.enabled,
        hasPosition: !!position && position.quantity > 0,
        currentQuantity: position?.quantity ?? null,
        currentValue,
      };
    });
  }

  /**
   * Add a new target asset to a portfolio
   * If the asset doesn't exist, it will be created and historical prices downloaded
   */
  async addTargetAsset(
    portfolioId: string,
    dto: UpsertTargetAssetDto,
  ): Promise<TargetAssetResponse> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        targetAssets: {
          include: { asset: true },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException(`Portfolio ${portfolioId} not found`);
    }

    // Check if asset already exists in target assets
    const existingTarget = portfolio.targetAssets.find(
      ta => ta.asset.symbol === dto.symbol
    );
    if (existingTarget) {
      throw new BadRequestException(`Asset ${dto.symbol} already in portfolio target assets`);
    }

    // Get or create the asset
    let asset = await this.prisma.asset.findUnique({
      where: { symbol: dto.symbol },
    });

    if (!asset) {
      // Validate the symbol exists in Yahoo Finance
      const validation = await this.validateSymbol(dto.symbol);
      if (!validation.valid) {
        throw new BadRequestException(`Invalid symbol: ${dto.symbol}`);
      }

      // Create the asset
      asset = await this.prisma.asset.create({
        data: {
          symbol: dto.symbol,
          name: validation.name,
          assetType: validation.assetType,
        },
      });

      // Download historical prices (this could be done async in production)
      await this.downloadHistoricalPrices(asset.id, dto.symbol);
    }

    // Calculate weight if not provided
    const currentAssetCount = portfolio.targetAssets.filter(ta => ta.enabled).length;
    const defaultWeight = currentAssetCount > 0
      ? 1 / (currentAssetCount + 1)
      : 1;
    const targetWeight = dto.targetWeight ?? defaultWeight;

    // Create the target asset
    const targetAsset = await this.prisma.portfolioTargetAsset.create({
      data: {
        portfolioId,
        assetId: asset.id,
        targetWeight,
        enabled: dto.enabled ?? true,
      },
      include: {
        asset: true,
      },
    });

    // If auto-weight was used, rebalance all weights to sum to 1
    if (dto.targetWeight === undefined) {
      await this.normalizeWeights(portfolioId);
    }

    // Update the portfolio's targetWeightsJson for backwards compatibility
    await this.syncTargetWeightsJson(portfolioId);

    return {
      id: targetAsset.id,
      symbol: targetAsset.asset.symbol,
      name: targetAsset.asset.name,
      assetType: targetAsset.asset.assetType,
      targetWeight: targetAsset.targetWeight,
      enabled: targetAsset.enabled,
      hasPosition: false,
      currentQuantity: null,
      currentValue: null,
    };
  }

  /**
   * Update a target asset's weight or enabled status
   */
  async updateTargetAsset(
    portfolioId: string,
    symbol: string,
    dto: Partial<UpsertTargetAssetDto>,
  ): Promise<TargetAssetResponse> {
    const targetAsset = await this.prisma.portfolioTargetAsset.findFirst({
      where: {
        portfolioId,
        asset: { symbol },
      },
      include: {
        asset: true,
      },
    });

    if (!targetAsset) {
      throw new NotFoundException(`Target asset ${symbol} not found in portfolio`);
    }

    const updated = await this.prisma.portfolioTargetAsset.update({
      where: { id: targetAsset.id },
      data: {
        targetWeight: dto.targetWeight ?? targetAsset.targetWeight,
        enabled: dto.enabled ?? targetAsset.enabled,
      },
      include: {
        asset: true,
      },
    });

    // Sync backwards compatibility
    await this.syncTargetWeightsJson(portfolioId);

    // Get position info
    const position = await this.prisma.portfolioPosition.findUnique({
      where: {
        portfolioId_assetId: {
          portfolioId,
          assetId: updated.assetId,
        },
      },
    });

    return {
      id: updated.id,
      symbol: updated.asset.symbol,
      name: updated.asset.name,
      assetType: updated.asset.assetType,
      targetWeight: updated.targetWeight,
      enabled: updated.enabled,
      hasPosition: !!position && position.quantity > 0,
      currentQuantity: position?.quantity ?? null,
      currentValue: position?.exposureUsd ?? null,
    };
  }

  /**
   * Remove a target asset from a portfolio
   * Note: This does NOT remove the actual position if it exists
   */
  async removeTargetAsset(portfolioId: string, symbol: string): Promise<void> {
    const targetAsset = await this.prisma.portfolioTargetAsset.findFirst({
      where: {
        portfolioId,
        asset: { symbol },
      },
    });

    if (!targetAsset) {
      throw new NotFoundException(`Target asset ${symbol} not found in portfolio`);
    }

    await this.prisma.portfolioTargetAsset.delete({
      where: { id: targetAsset.id },
    });

    // Normalize remaining weights
    await this.normalizeWeights(portfolioId);

    // Sync backwards compatibility
    await this.syncTargetWeightsJson(portfolioId);
  }

  /**
   * Bulk update all target assets (for weight reallocation)
   */
  async bulkUpdateTargetAssets(
    portfolioId: string,
    dto: BulkUpdateTargetAssetsDto,
  ): Promise<TargetAssetResponse[]> {
    // Validate weights sum to 1
    const totalWeight = dto.assets.reduce((sum, a) => sum + a.targetWeight, 0);
    if (Math.abs(totalWeight - 1) > 0.01) {
      throw new BadRequestException(`Weights must sum to 1.0, got ${totalWeight.toFixed(4)}`);
    }

    // Update each target asset
    for (const assetDto of dto.assets) {
      const targetAsset = await this.prisma.portfolioTargetAsset.findFirst({
        where: {
          portfolioId,
          asset: { symbol: assetDto.symbol },
        },
      });

      if (targetAsset) {
        await this.prisma.portfolioTargetAsset.update({
          where: { id: targetAsset.id },
          data: {
            targetWeight: assetDto.targetWeight,
            enabled: assetDto.enabled ?? true,
          },
        });
      }
    }

    // Sync backwards compatibility
    await this.syncTargetWeightsJson(portfolioId);

    return this.getTargetAssets(portfolioId);
  }

  /**
   * Normalize weights to sum to 1 for all enabled assets
   */
  async normalizeWeights(portfolioId: string): Promise<void> {
    const targetAssets = await this.prisma.portfolioTargetAsset.findMany({
      where: { portfolioId, enabled: true },
    });

    if (targetAssets.length === 0) return;

    const totalWeight = targetAssets.reduce((sum, ta) => sum + ta.targetWeight, 0);
    if (totalWeight === 0) {
      // Equal weights if all are 0
      const equalWeight = 1 / targetAssets.length;
      for (const ta of targetAssets) {
        await this.prisma.portfolioTargetAsset.update({
          where: { id: ta.id },
          data: { targetWeight: equalWeight },
        });
      }
    } else {
      // Scale proportionally
      for (const ta of targetAssets) {
        await this.prisma.portfolioTargetAsset.update({
          where: { id: ta.id },
          data: { targetWeight: ta.targetWeight / totalWeight },
        });
      }
    }
  }

  /**
   * Sync target assets to the legacy targetWeightsJson field
   * This ensures backwards compatibility with existing code
   */
  async syncTargetWeightsJson(portfolioId: string): Promise<void> {
    const targetAssets = await this.prisma.portfolioTargetAsset.findMany({
      where: { portfolioId, enabled: true },
      include: { asset: true },
    });

    const weightsJson: Record<string, number> = {};
    for (const ta of targetAssets) {
      weightsJson[ta.asset.symbol] = ta.targetWeight;
    }

    await this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: { targetWeightsJson: JSON.stringify(weightsJson) },
    });
  }

  /**
   * Validate a symbol against Yahoo Finance
   */
  private async validateSymbol(symbol: string): Promise<{
    valid: boolean;
    name: string;
    assetType: string;
  }> {
    try {
      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );

      if (!response.ok) {
        return { valid: false, name: '', assetType: '' };
      }

      const data = await response.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (!meta) {
        return { valid: false, name: '', assetType: '' };
      }

      // Determine asset type from symbol/meta
      let assetType = 'stock';
      if (symbol.includes('-USD') || symbol.includes('BTC') || symbol.includes('ETH')) {
        assetType = 'crypto';
      } else if (symbol.includes('GLD') || symbol.includes('SLV') || symbol.includes('GC=F')) {
        assetType = 'commodity';
      } else if (symbol.includes('^') || symbol.includes('SPY') || symbol.includes('QQQ')) {
        assetType = 'index';
      } else if (symbol.includes('TLT') || symbol.includes('BND') || symbol.includes('AGG')) {
        assetType = 'bond';
      }

      return {
        valid: true,
        name: meta.shortName || meta.longName || symbol,
        assetType,
      };
    } catch {
      return { valid: false, name: '', assetType: '' };
    }
  }

  /**
   * Download historical prices for an asset
   */
  private async downloadHistoricalPrices(assetId: string, symbol: string): Promise<void> {
    try {
      // Download 2 years of data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - 2);

      const period1 = Math.floor(startDate.getTime() / 1000);
      const period2 = Math.floor(endDate.getTime() / 1000);

      const response = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' } }
      );

      if (!response.ok) return;

      const data = await response.json();
      const result = data?.chart?.result?.[0];
      if (!result?.timestamp || !result?.indicators?.quote?.[0]) return;

      const timestamps = result.timestamp;
      const quotes = result.indicators.quote[0];
      const adjClose = result.indicators?.adjclose?.[0]?.adjclose;

      // Batch insert prices
      const priceRecords = [];
      for (let i = 0; i < timestamps.length; i++) {
        const close = quotes.close[i];
        if (close === null || close === undefined) continue;

        const date = new Date(timestamps[i] * 1000);
        date.setUTCHours(0, 0, 0, 0);

        priceRecords.push({
          assetId,
          date,
          close,
          adjClose: adjClose?.[i] ?? close,
          source: 'yfinance',
        });
      }

      // Use createMany with skipDuplicates
      if (priceRecords.length > 0) {
        await this.prisma.assetPrice.createMany({
          data: priceRecords,
          skipDuplicates: true,
        });
      }
    } catch (error) {
      console.error(`Failed to download prices for ${symbol}:`, error);
    }
  }
}
