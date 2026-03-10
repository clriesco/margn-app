/**
 * Billing constants — tier definitions, limits, and Stripe price mappings.
 *
 * Tiers match the landing page (Pricing.astro):
 *   Starter (free) / Pro (€19/mo) / Institutional (€49/mo)
 *
 * Currency: EUR
 */

export enum SubscriptionTier {
  STARTER = "starter",
  PRO = "pro",
  INSTITUTIONAL = "institutional",
}

/** Higher rank = more permissive. Used by SubscriptionTierGuard. */
export const TIER_RANK: Record<string, number> = {
  [SubscriptionTier.STARTER]: 0,
  [SubscriptionTier.PRO]: 1,
  [SubscriptionTier.INSTITUTIONAL]: 2,
};

export interface TierLimits {
  maxPortfolios: number; // -1 = unlimited
  maxAssetsPerPortfolio: number; // -1 = unlimited
  rebalanceSharpeEnabled: boolean;
  dcaSignalsEnabled: boolean;
  backtestEnabled: boolean;
  backtestAdvancedEnabled: boolean; // custom date ranges
  analyticsFullEnabled: boolean; // XIRR, Sharpe, drawdown
  autoPriceIngestion: boolean;
  emailAlerts: boolean;
  exportEnabled: boolean; // CSV/Excel
  apiAccess: boolean;
  customRiskParams: boolean;
  dedicatedOnboarding: boolean;
  supportLevel: "community" | "priority" | "priority_sla";
}

export const TIER_LIMITS: Record<string, TierLimits> = {
  [SubscriptionTier.STARTER]: {
    maxPortfolios: 1,
    maxAssetsPerPortfolio: 5,
    rebalanceSharpeEnabled: false,
    dcaSignalsEnabled: false,
    backtestEnabled: false,
    backtestAdvancedEnabled: false,
    analyticsFullEnabled: false,
    autoPriceIngestion: false,
    emailAlerts: false,
    exportEnabled: false,
    apiAccess: false,
    customRiskParams: false,
    dedicatedOnboarding: false,
    supportLevel: "community",
  },
  [SubscriptionTier.PRO]: {
    maxPortfolios: 3,
    maxAssetsPerPortfolio: -1, // unlimited
    rebalanceSharpeEnabled: true,
    dcaSignalsEnabled: true,
    backtestEnabled: true,
    backtestAdvancedEnabled: false,
    analyticsFullEnabled: true,
    autoPriceIngestion: true,
    emailAlerts: true,
    exportEnabled: false,
    apiAccess: false,
    customRiskParams: false,
    dedicatedOnboarding: false,
    supportLevel: "priority",
  },
  [SubscriptionTier.INSTITUTIONAL]: {
    maxPortfolios: -1, // unlimited
    maxAssetsPerPortfolio: -1,
    rebalanceSharpeEnabled: true,
    dcaSignalsEnabled: true,
    backtestEnabled: true,
    backtestAdvancedEnabled: true,
    analyticsFullEnabled: true,
    autoPriceIngestion: true,
    emailAlerts: true,
    exportEnabled: true,
    apiAccess: true,
    customRiskParams: true,
    dedicatedOnboarding: true,
    supportLevel: "priority_sla",
  },
};

/** Pro trial duration in days. */
export const PRO_TRIAL_DAYS = 14;

/**
 * Stripe Price IDs — loaded from environment.
 * Created in the Stripe Dashboard for EUR currency.
 */
export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  institutional_monthly: process.env.STRIPE_PRICE_INSTITUTIONAL_MONTHLY,
  institutional_yearly: process.env.STRIPE_PRICE_INSTITUTIONAL_YEARLY,
} as const;

export type StripePriceKey = keyof typeof STRIPE_PRICES;

/** Map a Stripe Price ID back to a tier. */
export function tierFromPriceId(priceId: string): SubscriptionTier {
  if (
    priceId === STRIPE_PRICES.pro_monthly ||
    priceId === STRIPE_PRICES.pro_yearly
  ) {
    return SubscriptionTier.PRO;
  }
  if (
    priceId === STRIPE_PRICES.institutional_monthly ||
    priceId === STRIPE_PRICES.institutional_yearly
  ) {
    return SubscriptionTier.INSTITUTIONAL;
  }
  return SubscriptionTier.STARTER;
}

/** Statuses considered "active" for feature access. */
export const ACTIVE_STATUSES = ["active", "trialing", "past_due"] as const;

/** Subscription statuses that grant the paid tier even after cancellation (until period end). */
export function isEffectivelyActive(
  status: string,
  currentPeriodEnd: Date | null
): boolean {
  if ((ACTIVE_STATUSES as readonly string[]).includes(status)) return true;
  // Cancelled but still within paid period
  if (
    status === "canceled" &&
    currentPeriodEnd &&
    currentPeriodEnd > new Date()
  ) {
    return true;
  }
  return false;
}
