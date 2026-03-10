import {
  Injectable,
  Logger,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import {
  SubscriptionTier,
  TIER_LIMITS,
  TIER_RANK,
  TierLimits,
  tierFromPriceId,
  isEffectivelyActive,
} from "./billing.constants";
import { StripeService } from "./stripe.service";

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private prisma: PrismaService,
    private stripeService: StripeService
  ) {}

  // ─── Provisioning ──────────────────────────────────────────────────

  /**
   * Create a starter (free) subscription for a new user.
   * Called after user creation in the auth flow.
   */
  async provisionStarterSubscription(
    userId: string,
    email: string
  ): Promise<void> {
    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (existing) return;

    const customer = await this.stripeService.createCustomer(email, {
      margn_user_id: userId,
    });

    await this.prisma.subscription.create({
      data: {
        userId,
        stripeCustomerId: customer.id,
        tier: SubscriptionTier.STARTER,
        status: "active",
      },
    });

    this.logger.log(
      `Provisioned starter subscription for user ${userId} (Stripe customer ${customer.id})`
    );
  }

  // ─── Queries ───────────────────────────────────────────────────────

  /**
   * Get the full subscription object for a user.
   */
  async getSubscription(userId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    if (!sub) {
      return {
        tier: SubscriptionTier.STARTER,
        status: "active",
        billingInterval: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        stripeCustomerId: null,
        limits: TIER_LIMITS[SubscriptionTier.STARTER],
      };
    }

    const effectiveTier = this.resolveEffectiveTier(sub);

    return {
      tier: sub.tier,
      status: sub.status,
      billingInterval: sub.billingInterval,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      trialEnd: sub.trialEnd,
      stripeCustomerId: sub.stripeCustomerId,
      limits: TIER_LIMITS[effectiveTier] || TIER_LIMITS[SubscriptionTier.STARTER],
    };
  }

  /**
   * Resolve the effective tier for a user, accounting for grace periods.
   */
  async getEffectiveTier(userId: string): Promise<string> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) return SubscriptionTier.STARTER;
    return this.resolveEffectiveTier(sub);
  }

  /**
   * Get tier limits for a user.
   */
  async getTierLimits(userId: string): Promise<TierLimits> {
    const tier = await this.getEffectiveTier(userId);
    return TIER_LIMITS[tier] || TIER_LIMITS[SubscriptionTier.STARTER];
  }

  /**
   * Check if a user has at least the given tier rank.
   */
  async hasMinimumTier(userId: string, requiredTier: string): Promise<boolean> {
    const effectiveTier = await this.getEffectiveTier(userId);
    return (TIER_RANK[effectiveTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 0);
  }

  // ─── Stripe Sync (called from webhooks) ────────────────────────────

  /**
   * Sync subscription state from a Stripe subscription object.
   * Called on customer.subscription.created / updated events.
   */
  async syncFromStripe(stripeSubscription: any): Promise<void> {
    const customerId = stripeSubscription.customer as string;

    const sub = await this.prisma.subscription.findUnique({
      where: { stripeCustomerId: customerId },
    });

    if (!sub) {
      this.logger.warn(
        `No subscription found for Stripe customer ${customerId}`
      );
      return;
    }

    const priceId = stripeSubscription.items?.data?.[0]?.price?.id;
    const tier = priceId
      ? tierFromPriceId(priceId)
      : sub.tier;
    const interval =
      stripeSubscription.items?.data?.[0]?.price?.recurring?.interval;

    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: priceId || sub.stripePriceId,
        tier,
        billingInterval: interval || sub.billingInterval,
        status: stripeSubscription.status,
        currentPeriodStart: stripeSubscription.current_period_start
          ? new Date(stripeSubscription.current_period_start * 1000)
          : sub.currentPeriodStart,
        currentPeriodEnd: stripeSubscription.current_period_end
          ? new Date(stripeSubscription.current_period_end * 1000)
          : sub.currentPeriodEnd,
        cancelAtPeriodEnd:
          stripeSubscription.cancel_at_period_end ?? sub.cancelAtPeriodEnd,
        canceledAt: stripeSubscription.canceled_at
          ? new Date(stripeSubscription.canceled_at * 1000)
          : null,
        trialEnd: stripeSubscription.trial_end
          ? new Date(stripeSubscription.trial_end * 1000)
          : null,
      },
    });

    this.logger.log(
      `Synced subscription ${sub.id}: tier=${tier}, status=${stripeSubscription.status}`
    );
  }

  /**
   * Handle subscription deletion from Stripe.
   * Downgrades user back to starter tier.
   */
  async handleSubscriptionDeleted(stripeSubscription: any): Promise<void> {
    const customerId = stripeSubscription.customer as string;

    const result = await this.prisma.subscription.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        tier: SubscriptionTier.STARTER,
        status: "canceled",
        stripeSubscriptionId: null,
        stripePriceId: null,
        canceledAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Subscription deleted for Stripe customer ${customerId}, downgraded to starter`
      );
    }
  }

  // ─── Downgrade Validation ──────────────────────────────────────────

  /**
   * Check if downgrading to a new tier would violate limits.
   * Returns a list of violations, or empty if clean.
   */
  async validateDowngrade(
    userId: string,
    newTier: string
  ): Promise<string[]> {
    const limits = TIER_LIMITS[newTier];
    if (!limits) return [`Unknown tier: ${newTier}`];

    const violations: string[] = [];

    if (limits.maxPortfolios !== -1) {
      const count = await this.prisma.portfolio.count({
        where: { userId },
      });
      if (count > limits.maxPortfolios) {
        violations.push(
          `Tienes ${count} portfolios pero el plan ${newTier} permite ${limits.maxPortfolios}`
        );
      }
    }

    if (limits.maxAssetsPerPortfolio !== -1) {
      const portfolios = await this.prisma.portfolio.findMany({
        where: { userId },
        include: { _count: { select: { positions: true } } },
      });
      for (const p of portfolios) {
        if (p._count.positions > limits.maxAssetsPerPortfolio) {
          violations.push(
            `Portfolio "${p.name}" tiene ${p._count.positions} activos pero el plan ${newTier} permite ${limits.maxAssetsPerPortfolio}`
          );
        }
      }
    }

    return violations;
  }

  // ─── Internals ─────────────────────────────────────────────────────

  private resolveEffectiveTier(sub: {
    tier: string;
    status: string;
    currentPeriodEnd: Date | null;
  }): string {
    if (isEffectivelyActive(sub.status, sub.currentPeriodEnd)) {
      return sub.tier;
    }
    return SubscriptionTier.STARTER;
  }
}
