import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { StrategiesController } from './strategies.controller';
import { StrategiesService } from './strategies.service';
import { StrategyAnalysisService } from './strategy-analysis.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [StrategiesController],
  providers: [StrategiesService, StrategyAnalysisService],
})
export class StrategiesModule {}
