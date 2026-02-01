import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

import { BacktestController } from './backtest.controller';
import { BacktestService } from './backtest.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [BacktestController],
  providers: [BacktestService],
})
export class BacktestModule {}
