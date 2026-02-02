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

import { RebalanceService, RebalanceProposal } from "./rebalance.service";

/**
 * Controller for portfolio rebalancing operations
 */
@Controller("portfolios/:portfolioId/rebalance")
@UseGuards(AuthGuard, PortfolioOwnershipGuard)
export class RebalanceController {
  constructor(private readonly rebalanceService: RebalanceService) {}

  /**
   * Calculate rebalance proposal for a portfolio
   * @param portfolioId - Portfolio ID
   * @returns Rebalance proposal with target allocations
   */
  @Get("proposal")
  async getProposal(
    @Param("portfolioId") portfolioId: string
  ): Promise<RebalanceProposal> {
    try {
      return await this.rebalanceService.calculateProposal(portfolioId);
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to calculate proposal",
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Accept a rebalance proposal
   * @param portfolioId - Portfolio ID
   * @param proposal - The proposal to accept
   */
  @Post("accept")
  async acceptProposal(
    @Param("portfolioId") portfolioId: string,
    @Body() proposal: RebalanceProposal
  ): Promise<{ success: boolean; message: string }> {
    try {
      await this.rebalanceService.acceptProposal(portfolioId, proposal);
      return {
        success: true,
        message: "Rebalance accepted and portfolio updated",
      };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : "Failed to accept proposal",
        HttpStatus.BAD_REQUEST
      );
    }
  }
}

