import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";

import { AdminGuard } from "./admin.guard";
import { AuditLogService } from "./audit-log.service";

@Controller("admin/audit-logs")
@UseGuards(AuthGuard, AdminGuard)
export class AdminAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async findMany(
    @Query("adminId") adminId?: string,
    @Query("targetType") targetType?: string,
    @Query("action") action?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.auditLogService.findMany({
      adminId,
      targetType,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
