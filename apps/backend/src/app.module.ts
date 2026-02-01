import { Module } from "@nestjs/common";

import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { BacktestModule } from "./backtest/backtest.module";
import { ContributionsModule } from "./contributions/contributions.module";
import { CronModule } from "./cron/cron.module";
import { PortfoliosModule } from "./portfolios/portfolios.module";
import { PositionsModule } from "./positions/positions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RebalanceModule } from "./rebalance/rebalance.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ContributionsModule,
    PositionsModule,
    PortfoliosModule,
    RebalanceModule,
    BacktestModule,
    CronModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
