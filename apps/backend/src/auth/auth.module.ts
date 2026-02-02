import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { PortfolioOwnershipGuard } from "./portfolio-ownership.guard";

/**
 * Authentication module for passwordless login
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, PortfolioOwnershipGuard],
  exports: [AuthService, AuthGuard, PortfolioOwnershipGuard],
})
export class AuthModule {}
