import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../auth/auth.guard';
import { PortfolioOwnershipGuard } from '../auth/portfolio-ownership.guard';

import { ContributionsService } from './contributions.service';
import { CreateContributionDto } from './dto/create-contribution.dto';

@Controller('contributions')
@UseGuards(AuthGuard, PortfolioOwnershipGuard)
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateContributionDto) {
    return this.contributionsService.recordContribution(dto);
  }
}

