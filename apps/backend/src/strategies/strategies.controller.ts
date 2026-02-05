import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';

import { AuthGuard } from '../auth/auth.guard';

import { CreateStrategyDto, UpdateVisibilityDto } from './dto/create-strategy.dto';
import { StrategiesService } from './strategies.service';

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
@UseGuards(AuthGuard)
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

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

  @Post(':id/apply/:portfolioId')
  async applyToPortfolio(
    @Request() req: any,
    @Param('id') id: string,
    @Param('portfolioId') portfolioId: string,
  ) {
    return this.strategiesService.applyToPortfolio(req.user.id, id, portfolioId);
  }
}
