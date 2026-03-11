import { SetMetadata } from "@nestjs/common";

export const TIER_KEY = "requiredTier";

/**
 * Decorator to require a minimum subscription tier for an endpoint.
 * Used with SubscriptionTierGuard.
 *
 * @example @RequireTier('pro')
 */
export const RequireTier = (tier: string) => SetMetadata(TIER_KEY, tier);
