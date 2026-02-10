import { Module } from "@nestjs/common";

import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { ClerkWebhookController } from "./clerk-webhook.controller";
import { PortfolioOwnershipGuard } from "./portfolio-ownership.guard";

/**
 * Authentication module (Clerk)
 */
@Module({
  controllers: [AuthController, ClerkWebhookController],
  providers: [AuthService, AuthGuard, PortfolioOwnershipGuard],
  exports: [AuthService, AuthGuard, PortfolioOwnershipGuard],
})
export class AuthModule {}
