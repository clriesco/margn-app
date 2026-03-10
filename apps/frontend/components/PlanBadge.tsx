import React from "react";
import {
  SubscriptionTier,
  TIER_LABELS,
  TIER_COLORS,
  STATUS_LABELS,
} from "../lib/subscription";

interface PlanBadgeProps {
  tier: SubscriptionTier;
  status?: string;
  showStatus?: boolean;
  size?: "sm" | "md";
}

export default function PlanBadge({
  tier,
  status,
  showStatus = false,
  size = "sm",
}: PlanBadgeProps) {
  const colors = TIER_COLORS[tier];
  const fontSize = size === "sm" ? "0.6875rem" : "0.8125rem";
  const padding = size === "sm" ? "0.125rem 0.5rem" : "0.25rem 0.75rem";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: "9999px",
        padding,
        fontSize,
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1.4,
        whiteSpace: "nowrap",
      }}
    >
      {TIER_LABELS[tier]}
      {showStatus && status && status !== "active" && (
        <span style={{ opacity: 0.7, fontWeight: 500 }}>
          · {STATUS_LABELS[status] || status}
        </span>
      )}
    </span>
  );
}
