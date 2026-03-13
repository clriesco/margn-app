import { Module } from "@nestjs/common";

import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { BacktestModule } from "./backtest/backtest.module";
import { BillingModule } from "./billing/billing.module";
import { ContributionsModule } from "./contributions/contributions.module";
import { CronModule } from "./cron/cron.module";
import { EmailModule } from "./email/email.module";
import { PortfoliosModule } from "./portfolios/portfolios.module";
import { PositionsModule } from "./positions/positions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RebalanceModule } from "./rebalance/rebalance.module";
import { StrategiesModule } from "./strategies/strategies.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    BillingModule,
    AdminModule,
    UsersModule,
    ContributionsModule,
    PositionsModule,
    PortfoliosModule,
    RebalanceModule,
    BacktestModule,
    StrategiesModule,
    CronModule,
    EmailModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
