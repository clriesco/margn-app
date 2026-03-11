import {
  Controller,
  Delete,
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

import { AdminVouchersService } from "./admin-vouchers.service";
import { AdminGuard } from "./admin.guard";

@Controller("admin/vouchers")
@UseGuards(AuthGuard, AdminGuard)
export class AdminVouchersController {
  constructor(private readonly vouchersService: AdminVouchersService) {}

  @Get()
  async findMany(
    @Query("active") active?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.vouchersService.findMany({
      active,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.vouchersService.findOne(id);
  }

  @Post()
  async create(@Req() req: Request, @Body() body: any) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.vouchersService.create(adminId, body, ip);
  }

  @Put(":id")
  async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: any
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.vouchersService.update(adminId, id, body, ip);
  }

  @Delete(":id")
  async deactivate(@Req() req: Request, @Param("id") id: string) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.vouchersService.deactivate(adminId, id, ip);
  }
}
