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
    let sub = await this.prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    // Auto-provision starter subscription for existing users missing one
    if (!sub || !sub.stripeCustomerId) {
      await this.subscriptionService.provisionStarterSubscription(
        req.user.id,
        req.user.email,
      );
      sub = await this.prisma.subscription.findUnique({
        where: { userId: req.user.id },
      });
      if (!sub?.stripeCustomerId) {
        throw new BadRequestException("Failed to provision subscription. Please try again.");
      }
    }

    // If already on a paid plan (active or trialing), redirect to portal instead
    if (
      sub.tier !== "starter" &&
      (sub.status === "active" || sub.status === "trialing")
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

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3002").split(",")[0].trim();

    const session = await this.stripeService.createCheckoutSession({
      customerId: sub.stripeCustomerId,
      priceId,
      successUrl: `${frontendUrl}/dashboard/billing-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontendUrl}/dashboard/billing-cancel`,
      couponId,
      trialDays,
      metadata: {
        margn_user_id: req.user.id,
        ...(dto.voucherCode ? { voucher_code: dto.voucherCode.toUpperCase() } : {}),
      },
    });

    this.logger.log(
      `Checkout session created for user ${req.user.id}: ${dto.priceKey}`
    );

    return { url: session.url, sessionId: session.id };
  }

  /**
   * POST /api/billing/portal
   * Creates a Stripe Billing Portal session for managing subscription.
   */
  @Post("portal")
  async createPortalSession(@Req() req: any) {
    let sub = await this.prisma.subscription.findUnique({
      where: { userId: req.user.id },
    });

    // Auto-provision if missing
    if (!sub?.stripeCustomerId) {
      await this.subscriptionService.provisionStarterSubscription(
        req.user.id,
        req.user.email,
      );
      sub = await this.prisma.subscription.findUnique({
        where: { userId: req.user.id },
      });
      if (!sub?.stripeCustomerId) {
        throw new BadRequestException("No Stripe customer linked");
      }
    }

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3002").split(",")[0].trim();

    const session = await this.stripeService.createBillingPortalSession(
      sub.stripeCustomerId,
      `${frontendUrl}/dashboard/billing`
    );

    return { url: session.url };
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
