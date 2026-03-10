import React, { ReactNode } from "react";
import { useSubscription } from "../lib/hooks/use-subscription";
import { SubscriptionTier, TIER_LABELS } from "../lib/subscription";
import UpgradePrompt from "./UpgradePrompt";

interface FeatureGateProps {
  /** Minimum tier required to access this feature */
  requiredTier: SubscriptionTier;
  /** Content to render when user has access */
  children: ReactNode;
  /** Feature name shown in the upgrade prompt */
  featureName?: string;
  /** Render a compact inline lock instead of the full prompt */
  inline?: boolean;
}

/**
 * Conditionally render children based on user's subscription tier.
 * Shows an upgrade prompt when the user doesn't have access.
 */
export default function FeatureGate({
  requiredTier,
  children,
  featureName,
  inline = false,
}: FeatureGateProps) {
  const { hasAccess, isLoading } = useSubscription();

  // While loading, show nothing (avoids flash)
  if (isLoading) return null;

  if (hasAccess(requiredTier)) {
    return <>{children}</>;
  }

  if (inline) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          color: "var(--text-dim)",
          fontSize: "0.8125rem",
        }}
      >
        Requiere {TIER_LABELS[requiredTier]}
      </span>
    );
  }

  return (
    <UpgradePrompt
      requiredTier={requiredTier}
      featureName={featureName}
    />
  );
}
