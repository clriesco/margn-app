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

import { AdminUsersService } from "./admin-users.service";
import { AdminGuard } from "./admin.guard";

@Controller("admin/users")
@UseGuards(AuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly usersService: AdminUsersService) {}

  @Get()
  async findMany(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.usersService.findMany({
      search,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.usersService.findOne(id);
  }

  @Put(":id/role")
  async updateRole(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { role: string }
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.usersService.updateRole(adminId, id, body.role, ip);
  }

  @Post(":id/ban")
  async banUser(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: { reason: string }
  ) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.usersService.banUser(adminId, id, body.reason, ip);
  }

  @Post(":id/unban")
  async unbanUser(@Req() req: Request, @Param("id") id: string) {
    const adminId = (req as any).user.id;
    const ip = (req.headers["x-forwarded-for"] as string) || req.ip;
    return this.usersService.unbanUser(adminId, id, ip);
  }
}
