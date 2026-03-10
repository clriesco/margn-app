import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
} from "@nestjs/common";

import { AuthGuard } from "../auth/auth.guard";
import { PrismaService } from "../prisma/prisma.service";

import { STRIPE_PRICES, PRO_TRIAL_DAYS } from "./billing.constants";
import { CreateCheckoutDto } from "./dto/create-checkout.dto";
import { ValidateVoucherDto } from "./dto/validate-voucher.dto";
import { StripeService } from "./stripe.service";
import { SubscriptionService } from "./subscription.service";
import { VoucherService } from "./voucher.service";

/**
 * User-facing billing endpoints.
 * All routes require authentication.
 */
@Controller("billing")
@UseGuards(AuthGuard)
export class BillingController {
  private readonly logger = new Logger(BillingController.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private subscriptionService: SubscriptionService,
    private voucherService: VoucherService
  ) {}

  /**
   * GET /api/billing/subscription
   * Returns current subscription state and tier limits.
   */
  @Get("subscription")
  async getSubscription(@Req() req: any) {
    return this.subscriptionService.getSubscription(req.user.id);
  }

  /**
   * POST /api/billing/checkout
   * Creates a Stripe Checkout session and returns the URL.
   */
  @Post("checkout")
  async createCheckout(@Req() req: any, @Body() dto: CreateCheckoutDto) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    if (!sub) {
      throw new BadRequestException("No subscription record found");
    }

    if (!sub.stripeCustomerId) {
      throw new BadRequestException("No Stripe customer linked");
    }

    // If already on a paid plan, redirect to portal instead
    if (
      sub.tier !== "starter" &&
      sub.status === "active"
    ) {
      throw new BadRequestException(
        "You already have an active subscription. Use the customer portal to change plans."
      );
    }

    const priceId = STRIPE_PRICES[dto.priceKey as keyof typeof STRIPE_PRICES];
    if (!priceId) {
      throw new BadRequestException(
        `Invalid price key: ${dto.priceKey}. Check that STRIPE_PRICE_* env vars are set.`
      );
    }

    let couponId: string | undefined;
    let trialDays: number | undefined;

    // Apply voucher if provided
    if (dto.voucherCode) {
      const voucher = await this.voucherService.validate(
        dto.voucherCode,
        sub.id
      );
      couponId = voucher.stripeCouponId || undefined;
      trialDays = voucher.trialDays || undefined;
    }

    // Default: 14-day trial for Pro plans (if no voucher overrides it)
    // and user has never had a trial before
    if (
      !trialDays &&
      dto.priceKey.startsWith("pro_") &&
      !sub.trialEnd
    ) {
      trialDays = PRO_TRIAL_DAYS;
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3002";

    const session = await this.stripeService.createCheckoutSession({
      customerId: sub.stripeCustomerId,
      priceId,
      successUrl: `${frontendUrl}/dashboard/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/billing-cancel`,
      couponId,
      trialDays,
      metadata: { margn_user_id: req.user.id },
    });

    this.logger.log(
      `Checkout session created for user ${req.user.id}: ${dto.priceKey}`
    );

    // Redeem voucher now that checkout started
    if (dto.voucherCode) {
      await this.voucherService.redeem(dto.voucherCode, sub.id, req.user.id);
    }

    return { checkoutUrl: session.url };
  }

  /**
   * POST /api/billing/portal
   * Creates a Stripe Billing Portal session for managing subscription.
   */
  @Post("portal")
  async createPortalSession(@Req() req: any) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    if (!sub?.stripeCustomerId) {
      throw new BadRequestException("No Stripe customer linked");
    }

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3002";

    const session = await this.stripeService.createBillingPortalSession(
      sub.stripeCustomerId,
      `${frontendUrl}/dashboard/billing`
    );

    return { portalUrl: session.url };
  }

  /**
   * POST /api/billing/voucher/validate
   * Validates a voucher code without redeeming it.
   */
  @Post("voucher/validate")
  async validateVoucher(
    @Req() req: any,
    @Body() dto: ValidateVoucherDto
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    if (!sub) {
      throw new BadRequestException("No subscription record found");
    }

    return this.voucherService.validate(dto.code, sub.id);
  }
}
