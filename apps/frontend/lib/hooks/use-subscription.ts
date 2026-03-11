import useSWR, { mutate } from "swr";
import { useAuth } from "../auth";
import { getSubscription, SubscriptionResponse } from "../api";
import { swrConfig } from "../swr-config";
import { SubscriptionTier, TierLimits, hasTierAccess } from "../subscription";

/**
 * Hook to get current user's subscription (cached)
 */
export function useSubscription() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate: revalidate } = useSWR<SubscriptionResponse>(
    user ? "subscription" : null,
    () => getSubscription(),
    {
      ...swrConfig,
      revalidateIfStale: true,
    }
  );

  const tier: SubscriptionTier = (data?.tier as SubscriptionTier) || "starter";
  const limits: TierLimits | null = data?.limits || null;

  return {
    subscription: data || null,
    tier,
    limits,
    status: data?.status || "active",
    isTrialing: data?.status === "trialing",
    trialEndsAt: data?.trialEnd ? new Date(data.trialEnd) : null,
    isLoading,
    error,
    mutate: revalidate,
    /** Check if user has access to a feature tier */
    hasAccess: (requiredTier: SubscriptionTier) => hasTierAccess(tier, requiredTier),
  };
}

/**
 * Invalidate subscription cache (call after checkout, portal return, etc.)
 */
export function invalidateSubscriptionCache() {
  mutate("subscription", undefined, { revalidate: true });
}
