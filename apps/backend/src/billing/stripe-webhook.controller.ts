import {
  Controller,
  Post,
  Req,
  Res,
  Logger,
  HttpCode,
} from "@nestjs/common";
import { Request, Response } from "express";

import { PrismaService } from "../prisma/prisma.service";

import { StripeService } from "./stripe.service";
import { SubscriptionService } from "./subscription.service";
import { VoucherService } from "./voucher.service";

/**
 * Stripe webhook handler.
 * No AuthGuard — requests come from Stripe, verified via signature.
 */
@Controller("webhooks")
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService,
    private subscriptionService: SubscriptionService,
    private voucherService: VoucherService
  ) {}

  @Post("stripe")
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers["stripe-signature"] as string;
    if (!signature) {
      this.logger.error("Missing stripe-signature header");
      return res.status(400).json({ error: "Missing signature" });
    }

    // Verify signature using raw body
    let event;
    try {
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        this.logger.error("Raw body not available — check rawBody: true in NestFactory.create");
        return res.status(400).json({ error: "Raw body not available" });
      }
      event = this.stripeService.constructWebhookEvent(rawBody, signature);
    } catch (err: any) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    // Idempotency: skip if already processed
    const existing = await this.prisma.stripeEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (existing) {
      this.logger.log(`Event ${event.id} already processed, skipping`);
      return res.json({ received: true });
    }

    try {
      await this.processEvent(event);

      // Record as processed AFTER success
      await this.prisma.stripeEvent.create({
        data: {
          stripeEventId: event.id,
          type: event.type,
        },
      });
    } catch (err: any) {
      this.logger.error(
        `Error processing event ${event.id}: ${err.message}`,
        err.stack
      );
      // Return 500 so Stripe retries
      return res.status(500).json({ error: "Internal error" });
    }

    return res.json({ received: true });
  }

  private async processEvent(event: any): Promise<void> {
    const data = event.data.object;

    switch (event.type) {
      // ─── Subscription lifecycle ────────────────────────────────
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await this.subscriptionService.syncFromStripe(data);
        break;

      case "customer.subscription.deleted":
        await this.subscriptionService.handleSubscriptionDeleted(data);
        break;

      // ─── Payment events ────────────────────────────────────────
      case "invoice.payment_succeeded":
        this.logger.log(`Payment succeeded for customer ${data.customer}`);
        // TODO: send payment confirmation email when email notifications are implemented
        break;

      case "invoice.payment_failed":
        this.logger.warn(`Payment failed for customer ${data.customer}`);
        // TODO: send "update payment method" email when email notifications are implemented
        break;

      // ─── Checkout ──────────────────────────────────────────────
      case "checkout.session.completed":
        this.logger.log(`Checkout completed for customer ${data.customer}`);
        await this.handleCheckoutCompleted(data);
        break;

      default:
        this.logger.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle checkout.session.completed — redeem voucher if one was attached.
   */
  private async handleCheckoutCompleted(session: any): Promise<void> {
    const voucherCode = session.metadata?.voucher_code;
    const userId = session.metadata?.margn_user_id;

    if (!voucherCode || !userId) {
      return;
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      this.logger.warn(
        `Checkout completed with voucher ${voucherCode} but no subscription found for user ${userId}`
      );
      return;
    }

    try {
      await this.voucherService.redeem(voucherCode, sub.id, userId);
      this.logger.log(
        `Voucher ${voucherCode} redeemed on checkout completion for user ${userId}`
      );
    } catch (err: any) {
      // Log but don't fail the webhook — the payment already succeeded
      this.logger.error(
        `Failed to redeem voucher ${voucherCode} for user ${userId}: ${err.message}`
      );
    }
  }
}
