import { getAllRiskProfiles } from "@leveraged-dca/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Response } from "express";

import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { PortfolioOwnershipGuard } from "../auth/portfolio-ownership.guard";

import { CreatePortfolioDto } from "./dto/create-portfolio.dto";
import { OnboardingService } from "./onboarding.service";
import { PortfoliosService } from "./portfolios.service";

@Controller("portfolios")
export class PortfoliosController {
  constructor(
    private readonly portfoliosService: PortfoliosService,
    private readonly onboardingService: OnboardingService
  ) {}

  /**
   * Get available risk profiles
   * GET /api/portfolios/risk-profiles
   * Public endpoint (no auth required)
   */
  @Get("risk-profiles")
  getRiskProfiles() {
    return getAllRiskProfiles();
  }

  /**
   * Create a new portfolio (onboarding) with SSE progress
   * POST /api/portfolios
   * Returns Server-Sent Events stream with progress updates
   */
  @UseGuards(AuthGuard)
  @Post()
  @Header("Content-Type", "text/event-stream")
  @Header("Cache-Control", "no-cache")
  @Header("Connection", "keep-alive")
  async create(
    @Body() dto: CreatePortfolioDto,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: "connected", message: "Starting portfolio creation..." })}\n\n`);

    try {
      // Create portfolio with progress callback
      const result = await this.onboardingService.createPortfolioWithAssets(
        user.id,
        dto,
        (progress) => {
          // Send progress event via SSE
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        }
      );

      // Send final success message
      res.write(
        `data: ${JSON.stringify({ type: "complete", result })}\n\n`
      );
    } catch (error) {
      // Send error message
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        })}\n\n`
      );
    } finally {
      res.end();
    }
  }

  /**
   * Check if user needs onboarding (has no portfolios)
   * GET /api/portfolios/needs-onboarding
   */
  @Get("needs-onboarding")
  @UseGuards(AuthGuard)
  async needsOnboarding(@CurrentUser() user: any) {
    const hasPortfolio = await this.onboardingService.userHasPortfolio(user.id);
    return { needsOnboarding: !hasPortfolio };
  }

  /**
   * Get portfolios by user email
   * GET /api/portfolios?email=user@example.com
   */
  @Get()
  @UseGuards(AuthGuard)
  async findByUser(
    @Query("email") email: string,
    @CurrentUser() user: any
  ) {
    // Ensure user can only access their own portfolios
    if (email && email !== user.email) {
      throw new Error("Unauthorized: Cannot access other user's portfolios");
    }
    return this.portfoliosService.findByUserEmail(user.email);
  }

  /**
   * Get portfolio by ID with positions
   * GET /api/portfolios/:id
   */
  @Get(":id")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async find(@Param("id") id: string) {
    return this.portfoliosService.findById(id);
  }

  /**
   * Get portfolio metrics history
   * GET /api/portfolios/:id/metrics
   */
  @Get(":id/metrics")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async metrics(@Param("id") id: string) {
    return this.portfoliosService.getMetrics(id);
  }

  /**
   * Get contribution history for dashboard table
   * GET /api/portfolios/:id/contribution-history
   */
  @Get(":id/contribution-history")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async contributionHistory(@Param("id") id: string) {
    return this.portfoliosService.getContributionHistory(id);
  }

  /**
   * Get portfolio summary (latest metrics + positions)
   * GET /api/portfolios/:id/summary
   */
  @Get(":id/summary")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async summary(@Param("id") id: string) {
    return this.portfoliosService.getSummary(id);
  }

  /**
   * Get portfolio daily metrics
   * GET /api/portfolios/:id/daily-metrics
   */
  @Get(":id/daily-metrics")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async dailyMetrics(@Param("id") id: string) {
    return this.portfoliosService.getDailyMetrics(id);
  }

  /**
   * Delete a portfolio
   * DELETE /api/portfolios/:id
   */
  @Delete(":id")
  @UseGuards(AuthGuard, PortfolioOwnershipGuard)
  async delete(@Param("id") id: string, @CurrentUser() user: any) {
    return this.portfoliosService.deletePortfolio(user.id, id);
  }
}
