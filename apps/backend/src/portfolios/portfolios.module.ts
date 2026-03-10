import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { BillingModule } from "../billing/billing.module";

import { OnboardingService } from "./onboarding.service";
import { PortfolioConfigurationController } from "./portfolio-configuration.controller";
import { PortfolioConfigurationService } from "./portfolio-configuration.service";
import { PortfolioNotificationsController } from "./portfolio-notifications.controller";
import { PortfolioNotificationsService } from "./portfolio-notifications.service";
import { PortfoliosController } from "./portfolios.controller";
import { PortfoliosService } from "./portfolios.service";
import { TargetAssetsController } from "./target-assets.controller";
import { TargetAssetsService } from "./target-assets.service";


@Module({
  imports: [AuthModule, BillingModule],
  controllers: [
    PortfoliosController,
    PortfolioConfigurationController,
    PortfolioNotificationsController,
    TargetAssetsController,
  ],
  providers: [
    PortfoliosService,
    PortfolioConfigurationService,
    PortfolioNotificationsService,
    OnboardingService,
    TargetAssetsService,
  ],
  exports: [
    PortfoliosService,
    PortfolioConfigurationService,
    PortfolioNotificationsService,
    OnboardingService,
    TargetAssetsService,
  ],
})
export class PortfoliosModule {}
