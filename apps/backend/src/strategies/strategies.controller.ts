import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';

import { CreateStrategyDto } from './dto/create-strategy.dto';
import { StrategiesService } from './strategies.service';

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

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.strategiesService.findOne(req.user.id, id);
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
