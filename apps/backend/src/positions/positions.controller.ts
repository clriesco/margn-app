import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { PortfolioOwnershipGuard } from '../auth/portfolio-ownership.guard';

import { UpsertPositionsDto } from './dto/upsert-positions.dto';
import { PositionsService } from './positions.service';

@Controller('positions')
@UseGuards(AuthGuard)
export class PositionsController {
  constructor(private readonly positionsService: PositionsService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async upsert(@Body() dto: UpsertPositionsDto) {
    console.log("[PositionsController] Received upsert request:", {
      portfolioId: dto.portfolioId,
      positionsCount: dto.positions?.length || 0,
      positions: dto.positions?.map(p => ({ symbol: p.symbol, quantity: p.quantity })),
      hasEquity: dto.equity !== undefined,
      equity: dto.equity
    });
    
    try {
      const result = await this.positionsService.upsert(dto);
      console.log("[PositionsController] Upsert completed successfully, returning", result?.length || 0, "positions");
      return result;
    } catch (error) {
      console.error("[PositionsController] Error in upsert:", error);
      throw error;
    }
  }

  @Get('search-symbols')
  async searchSymbols(@Query('q') query: string) {
    return this.positionsService.searchSymbols(query);
  }
}

