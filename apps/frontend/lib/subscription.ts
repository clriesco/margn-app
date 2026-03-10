/**
 * Subscription tier definitions and helpers for the frontend.
 * Mirrors backend billing.constants.ts but only exposes what the UI needs.
 */

export type SubscriptionTier = "starter" | "pro" | "institutional";

export interface TierLimits {
  maxPortfolios: number; // -1 = unlimited
  maxAssetsPerPortfolio: number;
  rebalanceSharpeEnabled: boolean;
  dcaSignalsEnabled: boolean;
  backtestEnabled: boolean;
  backtestAdvancedEnabled: boolean;
  analyticsFullEnabled: boolean;
  autoPriceIngestion: boolean;
  emailAlerts: boolean;
  exportEnabled: boolean;
  apiAccess: boolean;
  customRiskParams: boolean;
  dedicatedOnboarding: boolean;
  supportLevel: "community" | "priority" | "priority_sla";
}

export interface PlanDefinition {
  tier: SubscriptionTier;
  name: string;
  priceMonthly: number; // EUR
  priceYearly: number; // EUR (per month equivalent)
  priceYearlyTotal: number; // EUR (annual total)
  features: string[];
  highlighted?: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    tier: "starter",
    name: "Starter",
    priceMonthly: 0,
    priceYearly: 0,
    priceYearlyTotal: 0,
    features: [
      "1 portfolio",
      "Hasta 5 activos",
      "Rebalanceo con pesos manuales",
      "Métricas básicas",
      "Soporte comunidad",
    ],
  },
  {
    tier: "pro",
    name: "Pro",
    priceMonthly: 19,
    priceYearly: 15,
    priceYearlyTotal: 180,
    highlighted: true,
    features: [
      "Hasta 3 portfolios",
      "Activos ilimitados",
      "Optimización Sharpe dinámico",
      "Señales DCA condicional",
      "Backtest Monte Carlo",
      "Analíticas completas (XIRR, Sharpe, drawdown)",
      "Precios automáticos diarios",
      "Alertas por email",
      "Soporte prioritario",
    ],
  },
  {
    tier: "institutional",
    name: "Institutional",
    priceMonthly: 49,
    priceYearly: 39,
    priceYearlyTotal: 468,
    features: [
      "Portfolios ilimitados",
      "Todo en Pro",
      "Backtest avanzado (rangos personalizados)",
      "Exportación CSV/Excel",
      "Acceso API",
      "Parámetros de riesgo personalizados",
      "Onboarding dedicado",
      "SLA de soporte",
    ],
  },
];

/** Tier rank for comparison: higher = more permissive */
const TIER_RANK: Record<SubscriptionTier, number> = {
  starter: 0,
  pro: 1,
  institutional: 2,
};

/** Check if user's tier is at least the required tier */
export function hasTierAccess(
  userTier: SubscriptionTier,
  requiredTier: SubscriptionTier
): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[requiredTier];
}

/** Get plan definition by tier */
export function getPlan(tier: SubscriptionTier): PlanDefinition {
  return PLANS.find((p) => p.tier === tier) || PLANS[0];
}

/** Tier display names */
export const TIER_LABELS: Record<SubscriptionTier, string> = {
  starter: "Starter",
  pro: "Pro",
  institutional: "Institutional",
};

/** Tier colors for badges */
export const TIER_COLORS: Record<
  SubscriptionTier,
  { bg: string; text: string; border: string }
> = {
  starter: {
    bg: "rgba(148, 163, 184, 0.1)",
    text: "#94a3b8",
    border: "rgba(148, 163, 184, 0.3)",
  },
  pro: {
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.3)",
  },
  institutional: {
    bg: "rgba(168, 85, 247, 0.1)",
    text: "#c084fc",
    border: "rgba(168, 85, 247, 0.3)",
  },
};

/** Status display */
export const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  trialing: "Prueba gratuita",
  past_due: "Pago pendiente",
  canceled: "Cancelada",
  incomplete: "Incompleta",
  incomplete_expired: "Expirada",
  unpaid: "Impagada",
};

/** Price key for checkout */
export type StripePriceKey =
  | "pro_monthly"
  | "pro_yearly"
  | "institutional_monthly"
  | "institutional_yearly";
