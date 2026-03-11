import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";
import { PortfoliosModule } from "../portfolios/portfolios.module";
import { PrismaModule } from "../prisma/prisma.module";

import { RebalanceController } from "./rebalance.controller";
import { RebalanceService } from "./rebalance.service";

/**
 * Module for portfolio rebalancing operations
 */
@Module({
  imports: [PrismaModule, PortfoliosModule, AuthModule, BillingModule],
  controllers: [RebalanceController],
  providers: [RebalanceService],
  exports: [RebalanceService],
})
export class RebalanceModule {}

