import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";

import { AdminAuditLogController } from "./admin-audit-log.controller";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminOperationsController } from "./admin-operations.controller";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminSubscriptionsController } from "./admin-subscriptions.controller";
import { AdminSubscriptionsService } from "./admin-subscriptions.service";
import { AdminUsersController } from "./admin-users.controller";
import { AdminUsersService } from "./admin-users.service";
import { AdminVouchersController } from "./admin-vouchers.controller";
import { AdminVouchersService } from "./admin-vouchers.service";
import { AdminGuard } from "./admin.guard";
import { AuditLogService } from "./audit-log.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [
    AdminUsersController,
    AdminSubscriptionsController,
    AdminVouchersController,
    AdminDashboardController,
    AdminOperationsController,
    AdminAuditLogController,
  ],
  providers: [
    AdminGuard,
    AuditLogService,
    AdminUsersService,
    AdminSubscriptionsService,
    AdminVouchersService,
    AdminDashboardService,
    AdminOperationsService,
  ],
  exports: [AuditLogService],
})
export class AdminModule {}
