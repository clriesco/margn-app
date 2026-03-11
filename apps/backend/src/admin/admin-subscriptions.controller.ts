import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Request } from "express";

import { AuthGuard } from "../auth/auth.guard";

import { AdminSubscriptionsService } from "./admin-subscriptions.service";
import { AdminGuard } from "./admin.guard";

@Controller("admin/subscriptions")
@UseGuards(AuthGuard, AdminGuard)
export class AdminSubscriptionsController {
  constructor(
    private readonly subscriptionsService: AdminSubscriptionsService
  ) {}

  @Get()
  async findMany(
    @Query("tier") tier?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.subscriptionsService.findMany({
      tier,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Put(":userId")
  async overrideTier(
    @Req() req: Request,
    @Param("userId") userId: string,
    @Body() body: { tier: string }
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.subscriptionsService.overrideTier(
      adminId,
      userId,
      body.tier,
      ip
    );
  }

  @Post(":userId/extend-trial")
  async extendTrial(
    @Req() req: Request,
    @Param("userId") userId: string,
    @Body() body: { days: number }
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.subscriptionsService.extendTrial(
      adminId,
      userId,
      body.days,
      ip
    );
  }

  @Post(":userId/comp")
  async grantComplimentary(
    @Req() req: Request,
    @Param("userId") userId: string,
    @Body() body: { tier: string; expiresAt?: string }
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.subscriptionsService.grantComplimentary(
      adminId,
      userId,
      body.tier,
      body.expiresAt,
      ip
    );
  }
}
