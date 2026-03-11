import { Injectable, Logger } from "@nestjs/common";
import Stripe from "stripe";

/**
 * Thin wrapper around the Stripe SDK.
 * All Stripe API calls go through here.
 */
@Injectable()
export class StripeService {
  private _stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);

  constructor() {
    if (process.env.STRIPE_SECRET_KEY) {
      this._stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
        apiVersion: "2026-02-25.clover",
        typescript: true,
      });
    } else {
      this.logger.warn(
        "STRIPE_SECRET_KEY not set — billing features will be unavailable"
      );
    }
  }

  private get stripe(): Stripe {
    if (!this._stripe) {
      throw new Error(
        "Stripe is not configured. Set STRIPE_SECRET_KEY env var."
      );
    }
    return this._stripe;
  }

  // ─── Customers ──────────────────────────────────────────────────────

  async createCustomer(
    email: string,
    metadata: Record<string, string>
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create({ email, metadata });
  }

  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    return this.stripe.customers.retrieve(
      customerId
    ) as Promise<Stripe.Customer>;
  }

  // ─── Checkout ───────────────────────────────────────────────────────

  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    couponId?: string;
    trialDays?: number;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Checkout.Session> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: params.customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: params.priceId, quantity: 1 }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
      subscription_data: {
        metadata: params.metadata,
      },
    };

    if (params.couponId) {
      sessionParams.discounts = [{ coupon: params.couponId }];
    }

    if (params.trialDays) {
      sessionParams.subscription_data!.trial_period_days = params.trialDays;
    }

    return this.stripe.checkout.sessions.create(sessionParams);
  }

  // ─── Billing Portal ────────────────────────────────────────────────

  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<Stripe.BillingPortal.Session> {
    return this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // ─── Subscriptions ─────────────────────────────────────────────────

  async getSubscription(
    subscriptionId: string
  ): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd = true
  ): Promise<Stripe.Subscription> {
    if (atPeriodEnd) {
      return this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
    }
    return this.stripe.subscriptions.cancel(subscriptionId);
  }

  // ─── Webhooks ──────────────────────────────────────────────────────

  constructWebhookEvent(
    payload: Buffer,
    signature: string
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  }
}
