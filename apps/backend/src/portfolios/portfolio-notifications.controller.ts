import { Controller, Get, Param, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import { PortfolioOwnershipGuard } from "../auth/portfolio-ownership.guard";

import { PortfolioNotificationsService } from "./portfolio-notifications.service";

/**
 * Controller for portfolio status notifications
 * Exposes endpoints to get status notifications based on user-defined parameters
 */
@Controller("portfolios/:portfolioId/notifications")
@UseGuards(AuthGuard, PortfolioOwnershipGuard)
export class PortfolioNotificationsController {
  constructor(
    private readonly notificationsService: PortfolioNotificationsService
  ) {}

  /**
   * Get all notifications for a portfolio
   * Includes current state, conditions, and calculated actions
   *
   * @param portfolioId - Portfolio ID
   * @returns Full notifications response
   */
  @Get()
  async getNotifications(@Param("portfolioId") portfolioId: string) {
    return this.notificationsService.getNotifications(portfolioId);
  }
}
