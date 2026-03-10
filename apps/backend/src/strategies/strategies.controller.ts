import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { Response } from 'express';

import { AuthGuard } from '../auth/auth.guard';
import { RequireTier } from '../billing/decorators/require-tier.decorator';
import { SubscriptionTierGuard } from '../billing/guards/subscription-tier.guard';

import { CreatePortfolioFromStrategyDto } from './dto/create-portfolio-from-strategy.dto';
import { CreateStrategyDto, UpdateVisibilityDto } from './dto/create-strategy.dto';
import { StrategiesService } from './strategies.service';
import { StrategyAnalysisService } from './strategy-analysis.service';

class UpdateStrategyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('strategies')
@UseGuards(AuthGuard, SubscriptionTierGuard)
@RequireTier('pro')
export class StrategiesController {
  constructor(
    private readonly strategiesService: StrategiesService,
    private readonly strategyAnalysisService: StrategyAnalysisService,
  ) {}

  @Post()
  async create(@Request() req: any, @Body() dto: CreateStrategyDto) {
    return this.strategiesService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.strategiesService.findAllByUser(req.user.id);
  }

  @Get('public')
  async findAllPublic(
    @Request() req: any,
    @Query('riskProfileId') riskProfileId?: string,
    @Query('type') type?: 'platform' | 'community',
  ) {
    return this.strategiesService.findAllPublic({
      riskProfileId,
      type,
      excludeUserId: req.user?.id,
    });
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.findOne(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateStrategyDto,
  ) {
    return this.strategiesService.update(req.user.id, id, dto);
  }

  @Patch(':id/visibility')
  async updateVisibility(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateVisibilityDto,
  ) {
    return this.strategiesService.updateVisibility(
      req.user.id,
      id,
      dto.isPublic,
    );
  }

  @Delete(':id')
  async delete(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.delete(req.user.id, id);
  }

  @Post(':id/analyze')
  async analyzeStrategy(
    @Request() req: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    // Verify access before streaming
    await this.strategiesService.findOne(req.user.id, id);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    try {
      const stream = this.strategyAnalysisService.streamAnalysis(id);

      for await (const text of stream) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate analysis';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }

  @Post(':id/create-portfolio')
  async createPortfolioFromStrategy(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreatePortfolioFromStrategyDto,
  ) {
    return this.strategiesService.createPortfolioFromStrategy(req.user.id, id, dto);
  }
}
