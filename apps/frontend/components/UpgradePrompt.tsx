import React from "react";
import { useRouter } from "next/router";
import { Lock } from "lucide-react";
import {
  SubscriptionTier,
  TIER_LABELS,
  TIER_COLORS,
  getPlan,
} from "../lib/subscription";

interface UpgradePromptProps {
  requiredTier: SubscriptionTier;
  featureName?: string;
}

export default function UpgradePrompt({
  requiredTier,
  featureName,
}: UpgradePromptProps) {
  const router = useRouter();
  const plan = getPlan(requiredTier);
  const colors = TIER_COLORS[requiredTier];

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${colors.border}`,
        borderRadius: "12px",
        padding: "2rem",
        textAlign: "center",
        maxWidth: "480px",
        margin: "2rem auto",
      }}
    >
      <div
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          background: colors.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1rem",
        }}
      >
        <Lock size={22} color={colors.text} />
      </div>

      <h3
        style={{
          fontSize: "1.125rem",
          fontWeight: 600,
          color: "var(--text-primary)",
          marginBottom: "0.5rem",
        }}
      >
        {featureName
          ? `${featureName} requiere el plan ${TIER_LABELS[requiredTier]}`
          : `Funcionalidad del plan ${TIER_LABELS[requiredTier]}`}
      </h3>

      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          marginBottom: "1.5rem",
          lineHeight: 1.5,
        }}
      >
        Actualiza tu plan para acceder a esta funcionalidad
        {plan.priceMonthly > 0 &&
          ` desde ${plan.priceYearly}\u20AC/mes`}
        .
      </p>

      <button
        onClick={() => router.push("/dashboard/billing")}
        style={{
          padding: "0.75rem 2rem",
          background: `linear-gradient(135deg, ${colors.text}, ${colors.border})`,
          color: "white",
          border: "none",
          borderRadius: "8px",
          fontSize: "0.9375rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Ver Planes
      </button>
    </div>
  );
}
