import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";

import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminGuard } from "./admin.guard";

@Controller("admin/dashboard")
@UseGuards(AuthGuard, AdminGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get("stats")
  async getStats() {
    return this.dashboardService.getStats();
  }

  @Get("activity")
  async getRecentActivity(@Query("days") days?: string) {
    return this.dashboardService.getRecentActivity(
      days ? parseInt(days, 10) : undefined
    );
  }
}
