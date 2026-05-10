import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpException,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import { PortfolioOwnershipGuard } from "../auth/portfolio-ownership.guard";
import { RequireTier } from "../billing/decorators/require-tier.decorator";
import { SubscriptionTierGuard } from "../billing/guards/subscription-tier.guard";

import { RebalanceService, RebalanceProposal } from "./rebalance.service";

/**
 * Controller for portfolio rebalancing simulation operations
 * Requires Pro tier or higher.
 */
@Controller("portfolios/:portfolioId/rebalance")
@UseGuards(AuthGuard, PortfolioOwnershipGuard, SubscriptionTierGuard)
@RequireTier("starter")
export class RebalanceController {
  constructor(private readonly rebalanceService: RebalanceService) {}

  /**
   * Calculate rebalance simulation for a portfolio
   * @param portfolioId - Portfolio ID
   * @returns Rebalance simulation with calculated allocations
   */
  @Get("simulation")
  async getSimulation(
    @Param("portfolioId") portfolioId: string
  ): Promise<RebalanceProposal> {
    try {
      return await this.rebalanceService.calculateProposal(portfolioId);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to calculate simulation",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Apply a rebalance simulation
   * @param portfolioId - Portfolio ID
   * @param proposal - The simulation to apply
   */
  @Post("apply")
  async applySimulation(
    @Param("portfolioId") portfolioId: string,
    @Body() body: RebalanceProposal & { executionPrices?: Record<string, number> }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const { executionPrices, ...proposal } = body;
      await this.rebalanceService.acceptProposal(portfolioId, proposal, executionPrices);
      return {
        success: true,
        message: "Simulation applied and portfolio updated",
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to apply simulation",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}

