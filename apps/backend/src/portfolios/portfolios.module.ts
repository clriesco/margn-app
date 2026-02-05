import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";

import { OnboardingService } from "./onboarding.service";
import { PortfolioConfigurationController } from "./portfolio-configuration.controller";
import { PortfolioConfigurationService } from "./portfolio-configuration.service";
import { PortfolioRecommendationsController } from "./portfolio-recommendations.controller";
import { PortfolioRecommendationsService } from "./portfolio-recommendations.service";
import { PortfoliosController } from "./portfolios.controller";
import { PortfoliosService } from "./portfolios.service";
import { TargetAssetsController } from "./target-assets.controller";
import { TargetAssetsService } from "./target-assets.service";


@Module({
  imports: [AuthModule],
  controllers: [
    PortfoliosController,
    PortfolioConfigurationController,
    PortfolioRecommendationsController,
    TargetAssetsController,
  ],
  providers: [
    PortfoliosService,
    PortfolioConfigurationService,
    PortfolioRecommendationsService,
    OnboardingService,
    TargetAssetsService,
  ],
  exports: [
    PortfoliosService,
    PortfolioConfigurationService,
    PortfolioRecommendationsService,
    OnboardingService,
    TargetAssetsService,
  ],
})
export class PortfoliosModule {}

