import React, { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../../lib/auth";
import { useSubscription } from "../../lib/hooks/use-subscription";
import {
  PLANS,
  SubscriptionTier,
  TIER_COLORS,
  STATUS_LABELS,
  StripePriceKey,
} from "../../lib/subscription";
import { createCheckoutSession, createBillingPortal } from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import PlanBadge from "../../components/PlanBadge";
import { Check, CreditCard, ExternalLink } from "lucide-react";

export default function Billing() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { subscription, tier, status, isTrialing, trialEndsAt, isLoading } =
    useSubscription();

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "yearly"
  );
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleCheckout = async (planTier: SubscriptionTier) => {
    if (planTier === "starter") return;

    const priceKey: StripePriceKey = `${planTier}_${billingCycle}` as StripePriceKey;
    setCheckoutLoading(planTier);
    setError("");

    try {
      const { url } = await createCheckoutSession(priceKey);
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar el pago"
      );
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    setError("");
    try {
      const { url } = await createBillingPortal();
      window.location.href = url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al abrir el portal de facturación"
      );
    }
  };

  if (loading || isLoading) {
    return (
      <>
        <Head>
          <title>Cargando...</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Facturación - Margn</title>
      </Head>
      <DashboardSidebar>
        <div style={{ padding: "2rem", paddingTop: "4rem" }}>
          <div style={{ maxWidth: "960px", margin: "0 auto" }}>
            {/* Header */}
            <div
              style={{
                marginBottom: "2rem",
                paddingBottom: "1.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h1
                style={{
                  fontSize: "1.875rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: "0.25rem",
                  letterSpacing: "-0.025em",
                }}
              >
                Facturación
              </h1>
              <p
                style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}
              >
                Gestiona tu suscripción y método de pago
              </p>
            </div>

            {/* Error */}
            {error && (
              <div
                style={{
                  padding: "1rem",
                  background: "rgba(248, 113, 113, 0.1)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  borderRadius: "8px",
                  marginBottom: "1.5rem",
                }}
              >
                <p style={{ color: "#f87171", margin: 0 }}>{error}</p>
              </div>
            )}

            {/* Current Plan Card */}
            <div
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "1.5rem",
                marginBottom: "2rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "1rem",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "1rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      Plan actual
                    </span>
                    <PlanBadge
                      tier={tier}
                      status={status}
                      showStatus
                      size="md"
                    />
                  </div>
                  {isTrialing && trialEndsAt && (
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.8125rem",
                      }}
                    >
                      Prueba gratuita hasta el{" "}
                      {trialEndsAt.toLocaleDateString("es-ES", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  )}
                  {status === "past_due" && (
                    <p
                      style={{
                        color: "#f59e0b",
                        fontSize: "0.8125rem",
                      }}
                    >
                      Tu pago está pendiente. Actualiza tu método de pago
                      para evitar la interrupción del servicio.
                    </p>
                  )}
                </div>

                {tier !== "starter" && (
                  <button
                    onClick={handleManageSubscription}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.625rem 1.25rem",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    <CreditCard size={16} />
                    Gestionar suscripción
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Billing Cycle Toggle */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "2rem",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "0.25rem",
                  gap: "0.25rem",
                }}
              >
                {(["monthly", "yearly"] as const).map((cycle) => (
                  <button
                    key={cycle}
                    onClick={() => setBillingCycle(cycle)}
                    style={{
                      padding: "0.5rem 1.25rem",
                      background:
                        billingCycle === cycle
                          ? "rgba(59, 130, 246, 0.15)"
                          : "transparent",
                      color:
                        billingCycle === cycle
                          ? "#60a5fa"
                          : "var(--text-muted)",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "0.875rem",
                      fontWeight: billingCycle === cycle ? 600 : 500,
                      cursor: "pointer",
                    }}
                  >
                    {cycle === "monthly" ? "Mensual" : "Anual"}
                    {cycle === "yearly" && (
                      <span
                        style={{
                          marginLeft: "0.375rem",
                          fontSize: "0.75rem",
                          color: "#10b981",
                          fontWeight: 600,
                        }}
                      >
                        -20%
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Plans Grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.5rem",
                marginBottom: "2rem",
              }}
            >
              {PLANS.map((plan) => {
                const isCurrentPlan = plan.tier === tier;
                const colors = TIER_COLORS[plan.tier];
                const price =
                  billingCycle === "monthly"
                    ? plan.priceMonthly
                    : plan.priceYearly;
                const isDowngrade =
                  plan.tier === "starter" && tier !== "starter";

                return (
                  <div
                    key={plan.tier}
                    style={{
                      background: "var(--bg-card)",
                      border: isCurrentPlan
                        ? `2px solid ${colors.text}`
                        : "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "1.5rem",
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                    }}
                  >
                    {plan.highlighted && (
                      <div
                        style={{
                          position: "absolute",
                          top: "-12px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          background:
                            "linear-gradient(135deg, #3b82f6, #6366f1)",
                          color: "white",
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "0.1875rem 0.75rem",
                          borderRadius: "9999px",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}
                      >
                        Popular
                      </div>
                    )}

                    <h3
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {plan.name}
                    </h3>

                    <div
                      style={{
                        marginBottom: "1.5rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "2rem",
                          fontWeight: 700,
                          color: "var(--text-primary)",
                        }}
                      >
                        {price === 0 ? "Gratis" : `${price}\u20AC`}
                      </span>
                      {price > 0 && (
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.875rem",
                          }}
                        >
                          /mes
                        </span>
                      )}
                      {billingCycle === "yearly" && price > 0 && (
                        <div
                          style={{
                            color: "var(--text-dim)",
                            fontSize: "0.75rem",
                            marginTop: "0.25rem",
                          }}
                        >
                          Facturado anualmente ({plan.priceYearlyTotal}
                          {"\u20AC"}/año)
                        </div>
                      )}
                    </div>

                    <ul
                      style={{
                        listStyle: "none",
                        padding: 0,
                        margin: 0,
                        flex: 1,
                        marginBottom: "1.5rem",
                      }}
                    >
                      {plan.features.map((feature, i) => (
                        <li
                          key={i}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.5rem",
                            fontSize: "0.8125rem",
                            color: "var(--text-secondary)",
                            marginBottom: "0.5rem",
                            lineHeight: 1.4,
                          }}
                        >
                          <Check
                            size={16}
                            color="#10b981"
                            style={{ flexShrink: 0, marginTop: "0.125rem" }}
                          />
                          {feature}
                        </li>
                      ))}
                    </ul>

                    {isCurrentPlan ? (
                      <button
                        disabled
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          background: "var(--bg-card)",
                          color: "var(--text-muted)",
                          border: `1px solid ${colors.border}`,
                          borderRadius: "8px",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor: "default",
                        }}
                      >
                        Plan actual
                      </button>
                    ) : isDowngrade ? (
                      <button
                        onClick={handleManageSubscription}
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          fontSize: "0.875rem",
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Cambiar a Starter
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCheckout(plan.tier)}
                        disabled={checkoutLoading === plan.tier}
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          background:
                            checkoutLoading === plan.tier
                              ? "var(--disabled-bg)"
                              : plan.highlighted
                                ? "linear-gradient(135deg, #3b82f6, #6366f1)"
                                : colors.bg,
                          color:
                            checkoutLoading === plan.tier
                              ? "var(--disabled-color)"
                              : plan.highlighted
                                ? "white"
                                : colors.text,
                          border: plan.highlighted
                            ? "none"
                            : `1px solid ${colors.border}`,
                          borderRadius: "8px",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          cursor:
                            checkoutLoading === plan.tier
                              ? "not-allowed"
                              : "pointer",
                        }}
                      >
                        {checkoutLoading === plan.tier
                          ? "Redirigiendo..."
                          : `Actualizar a ${plan.name}`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Disclaimer */}
            <p
              style={{
                textAlign: "center",
                color: "var(--text-dim)",
                fontSize: "0.75rem",
                lineHeight: 1.5,
              }}
            >
              Los precios no incluyen impuestos aplicables. Al suscribirte
              aceptas los{" "}
              <Link
                href="/terms"
                style={{
                  color: "var(--text-dim)",
                  textDecoration: "underline",
                }}
              >
                Términos y Condiciones
              </Link>
              . Puedes cancelar en cualquier momento.
            </p>
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
