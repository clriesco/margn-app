import { Module, forwardRef } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";

import { BillingController } from "./billing.controller";
import { SubscriptionTierGuard } from "./guards/subscription-tier.guard";
import { StripeWebhookController } from "./stripe-webhook.controller";
import { StripeService } from "./stripe.service";
import { SubscriptionService } from "./subscription.service";
import { VoucherService } from "./voucher.service";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [BillingController, StripeWebhookController],
  providers: [
    StripeService,
    SubscriptionService,
    VoucherService,
    SubscriptionTierGuard,
  ],
  exports: [SubscriptionService, StripeService, SubscriptionTierGuard],
})
export class BillingModule {}
