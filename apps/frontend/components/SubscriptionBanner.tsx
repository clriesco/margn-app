import React from "react";
import Link from "next/link";
import { useSubscription } from "../lib/hooks/use-subscription";
import { AlertTriangle, Clock, Info } from "lucide-react";

/**
 * Shows contextual banners for subscription states that need user attention:
 * - trialing: trial countdown
 * - past_due: payment failed warning
 * - canceled (still active): plan ending notice
 */
export default function SubscriptionBanner() {
  const { subscription, status, tier, isTrialing, trialEndsAt, isLoading } =
    useSubscription();

  if (isLoading || !subscription || tier === "starter") return null;

  // Trial countdown
  if (isTrialing && trialEndsAt) {
    const daysLeft = Math.max(
      0,
      Math.ceil(
        (trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    );

    return (
      <div
        role="status"
        style={{
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.875rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Clock size={16} color="#60a5fa" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>
            Tu prueba gratuita de Pro termina en{" "}
            <strong style={{ color: "#60a5fa" }}>
              {daysLeft} {daysLeft === 1 ? "día" : "días"}
            </strong>
          </span>
        </div>
        <Link
          href="/dashboard/billing"
          style={{
            color: "#60a5fa",
            fontWeight: 600,
            fontSize: "0.8125rem",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Ver planes
        </Link>
      </div>
    );
  }

  // Payment failed
  if (status === "past_due") {
    return (
      <div
        role="alert"
        style={{
          background: "rgba(239, 68, 68, 0.08)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.875rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <AlertTriangle
            size={16}
            color="#ef4444"
            aria-hidden="true"
            style={{ flexShrink: 0 }}
          />
          <span style={{ color: "var(--text-secondary)" }}>
            Tu pago ha fallado. Actualiza tu método de pago para mantener tu
            plan.
          </span>
        </div>
        <Link
          href="/dashboard/billing"
          style={{
            color: "#ef4444",
            fontWeight: 600,
            fontSize: "0.8125rem",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Actualizar pago
        </Link>
      </div>
    );
  }

  // Canceled but still in paid period
  if (
    status === "canceled" &&
    subscription.cancelAtPeriodEnd &&
    subscription.currentPeriodEnd
  ) {
    const endDate = new Date(subscription.currentPeriodEnd);
    const formatted = endDate.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return (
      <div
        role="status"
        style={{
          background: "rgba(251, 191, 36, 0.08)",
          border: "1px solid rgba(251, 191, 36, 0.2)",
          borderRadius: "8px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.875rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <Info size={16} color="#fbbf24" aria-hidden="true" style={{ flexShrink: 0 }} />
          <span style={{ color: "var(--text-secondary)" }}>
            Tu plan finaliza el{" "}
            <strong style={{ color: "#fbbf24" }}>{formatted}</strong>. Tus datos
            estarán seguros.
          </span>
        </div>
        <Link
          href="/dashboard/billing"
          style={{
            color: "#fbbf24",
            fontWeight: 600,
            fontSize: "0.8125rem",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Reactivar plan
        </Link>
      </div>
    );
  }

  return null;
}
