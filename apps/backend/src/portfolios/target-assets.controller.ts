import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { PortfolioOwnershipGuard } from '../auth/portfolio-ownership.guard';

import {
  TargetAssetsService,
  UpsertTargetAssetDto,
  BulkUpdateTargetAssetsDto,
  TargetAssetResponse,
} from './target-assets.service';

/**
 * Controller for managing portfolio target assets
 *
 * Target assets represent "what the user wants to hold" in their portfolio,
 * separate from actual positions ("what they actually hold").
 *
 * This allows users to:
 * - Configure their desired portfolio allocation before buying anything
 * - Add/remove assets without needing to specify quantities
 * - Have a clear separation between planning and execution
 */
@Controller('portfolios/:portfolioId/target-assets')
@UseGuards(AuthGuard, PortfolioOwnershipGuard)
export class TargetAssetsController {
  constructor(private readonly targetAssetsService: TargetAssetsService) {}

  /**
   * GET /portfolios/:portfolioId/target-assets
   * Get all target assets for a portfolio
   */
  @Get()
  async getTargetAssets(
    @Param('portfolioId') portfolioId: string,
  ): Promise<TargetAssetResponse[]> {
    return this.targetAssetsService.getTargetAssets(portfolioId);
  }

  /**
   * POST /portfolios/:portfolioId/target-assets
   * Add a new target asset to the portfolio
   */
  @Post()
  async addTargetAsset(
    @Param('portfolioId') portfolioId: string,
    @Body() dto: UpsertTargetAssetDto,
  ): Promise<TargetAssetResponse> {
    return this.targetAssetsService.addTargetAsset(portfolioId, dto);
  }

  /**
   * PUT /portfolios/:portfolioId/target-assets/:symbol
   * Update a target asset's weight or enabled status
   */
  @Put(':symbol')
  async updateTargetAsset(
    @Param('portfolioId') portfolioId: string,
    @Param('symbol') symbol: string,
    @Body() dto: Partial<UpsertTargetAssetDto>,
  ): Promise<TargetAssetResponse> {
    return this.targetAssetsService.updateTargetAsset(portfolioId, symbol, dto);
  }

  /**
   * DELETE /portfolios/:portfolioId/target-assets/:symbol
   * Remove a target asset from the portfolio
   * Note: This does NOT remove actual positions
   */
  @Delete(':symbol')
  async removeTargetAsset(
    @Param('portfolioId') portfolioId: string,
    @Param('symbol') symbol: string,
  ): Promise<{ success: boolean }> {
    await this.targetAssetsService.removeTargetAsset(portfolioId, symbol);
    return { success: true };
  }

  /**
   * PUT /portfolios/:portfolioId/target-assets
   * Bulk update all target assets (for weight reallocation)
   */
  @Put()
  async bulkUpdateTargetAssets(
    @Param('portfolioId') portfolioId: string,
    @Body() dto: BulkUpdateTargetAssetsDto,
  ): Promise<TargetAssetResponse[]> {
    return this.targetAssetsService.bulkUpdateTargetAssets(portfolioId, dto);
  }
}
