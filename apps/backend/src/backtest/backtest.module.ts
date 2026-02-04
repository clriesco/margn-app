import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { BacktestExplanationService } from './backtest-explanation.service';
import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BacktestController],
  providers: [BacktestService, BacktestExplanationService],
})
export class BacktestModule {}
