import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";

import { AuthGuard } from "../auth/auth.guard";

import { AdminOperationsService } from "./admin-operations.service";
import { AdminGuard } from "./admin.guard";

@Controller("admin/operations")
@UseGuards(AuthGuard, AdminGuard)
export class AdminOperationsController {
  constructor(
    private readonly operationsService: AdminOperationsService
  ) {}

  @Get("cron-status")
  async getCronStatus() {
    return this.operationsService.getCronStatus();
  }

  @Post("trigger-job")
  async triggerJob(
    @Req() req: Request,
    @Body() body: { job: string }
  ) {
    if (!this.operationsService.isValidJob(body.job)) {
      throw new BadRequestException(
        `Invalid job: ${body.job}. Valid jobs: price-ingestion, metrics-refresh, daily-check`
      );
    }

    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.operationsService.triggerJob(adminId, body.job, ip);
  }

  @Get("job-logs")
  async getJobLogs(
    @Query("job") job?: string,
    @Query("days") days?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.operationsService.getJobLogs({
      job,
      days: days ? parseInt(days, 10) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
