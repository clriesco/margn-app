/**
 * Risk Profiles for Leveraged DCA Strategy
 *
 * These profiles provide predefined configurations for different risk tolerances.
 * Users can select a profile instead of manually configuring leverage parameters.
 */

export type RiskProfileId =
  | "conservative"
  | "moderate"
  | "growth"
  | "aggressive";

export interface RiskProfileParams {
  // Leverage
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;

  // Margins
  maintenanceMarginRatio: number;

  // Optimization
  meanReturnShrinkage: number;
  maxWeight: number;
  minWeight: number;
  optimizationObjective: string; // 'sharpe', 'sortino', 'calmar', 'ulcer'

  // Backtest
  windowMonths: number;
}

export interface RiskProfile {
  id: RiskProfileId;
  name: string;
  nameEn: string;
  icon: string;
  description: string;
  shortDescription: string;
  riskLevel: 1 | 2 | 3 | 4;
  params: RiskProfileParams;
  suitableFor: string[];
  notSuitableFor: string[];
}

export const RISK_PROFILES: Record<RiskProfileId, RiskProfile> = {
  conservative: {
    id: "conservative",
    name: "Conservador",
    nameEn: "Conservative",
    icon: "🛡️",
    description:
      "Apalancamiento bajo con márgenes de seguridad amplios. El sistema rebalanceará con más frecuencia para mantener el riesgo controlado.",
    shortDescription: "Menor apalancamiento, más estable",
    riskLevel: 1,
    params: {
      leverageMin: 1.5,
      leverageMax: 2.0,
      leverageTarget: 1.75,
      maintenanceMarginRatio: 0.1,
      meanReturnShrinkage: 0.4,
      maxWeight: 0.25,
      minWeight: 0.1,
      optimizationObjective: "sharpe",
      windowMonths: 60,
    },
    suitableFor: [
      "Primera experiencia con apalancamiento",
      "Baja tolerancia a la volatilidad",
      "Horizonte de inversión < 10 años",
    ],
    notSuitableFor: [
      "Quienes buscan maximizar retornos",
      "Inversores con mucho tiempo por delante",
    ],
  },

  moderate: {
    id: "moderate",
    name: "Moderado",
    nameEn: "Moderate",
    icon: "⚖️",
    description:
      "Balance entre crecimiento y control de riesgo. El rango de leverage permite aprovechar subidas sin exponerse excesivamente en caídas.",
    shortDescription: "Equilibrio riesgo/retorno",
    riskLevel: 2,
    params: {
      leverageMin: 2.0,
      leverageMax: 3.0,
      leverageTarget: 2.5,
      maintenanceMarginRatio: 0.07,
      meanReturnShrinkage: 0.6,
      maxWeight: 0.35,
      minWeight: 0.05,
      optimizationObjective: "sharpe",
      windowMonths: 60,
    },
    suitableFor: [
      "Inversores con 10-20 años de horizonte",
      "Tolerancia media a la volatilidad",
      "Capacidad de mantener aportaciones en caídas",
    ],
    notSuitableFor: [
      "Quienes necesitan liquidez a corto plazo",
      "Propensos al pánico en correcciones",
    ],
  },

  growth: {
    id: "growth",
    name: "Crecimiento",
    nameEn: "Growth",
    icon: "📈",
    description:
      "Apalancamiento elevado para maximizar exposición al mercado. Requiere disciplina para mantener la estrategia en períodos de alta volatilidad.",
    shortDescription: "Mayor exposición al mercado",
    riskLevel: 3,
    params: {
      leverageMin: 2.5,
      leverageMax: 4.0,
      leverageTarget: 3.0,
      maintenanceMarginRatio: 0.05,
      meanReturnShrinkage: 0.7,
      maxWeight: 0.4,
      minWeight: 0.05,
      optimizationObjective: "sharpe",
      windowMonths: 48,
    },
    suitableFor: [
      "Horizonte de +15 años",
      "Alta tolerancia a drawdowns temporales",
      "Capacidad de aportar capital extra en caídas",
    ],
    notSuitableFor: [
      "Quienes revisan el portfolio frecuentemente",
      "Propensos a vender en pánico",
    ],
  },

  aggressive: {
    id: "aggressive",
    name: "Agresivo",
    nameEn: "Aggressive",
    icon: "🚀",
    description:
      "Máximo apalancamiento. El rango amplio permite alta exposición pero también mayor riesgo de margin call en correcciones severas.",
    shortDescription: "Máxima exposición",
    riskLevel: 4,
    params: {
      leverageMin: 3.0,
      leverageMax: 5.0,
      leverageTarget: 4.0,
      maintenanceMarginRatio: 0.05,
      meanReturnShrinkage: 0.85,
      maxWeight: 0.5,
      minWeight: 0.0,
      optimizationObjective: "sharpe",
      windowMonths: 36,
    },
    suitableFor: [
      "Inversores experimentados con apalancamiento",
      "Horizonte de +20 años",
      "Capacidad de aportar en crisis sin dudar",
    ],
    notSuitableFor: [
      "Nuevos en estrategias apalancadas",
      "Capital que puedas necesitar a medio plazo",
    ],
  },
};

// Helper functions

export function getRiskProfile(id: RiskProfileId | null): RiskProfile | null {
  if (!id) return null;
  return RISK_PROFILES[id] || null;
}

export function getRiskProfileParams(id: RiskProfileId): RiskProfileParams {
  return RISK_PROFILES[id].params;
}

export function getAllRiskProfiles(): RiskProfile[] {
  return Object.values(RISK_PROFILES);
}

export function getRiskProfileIds(): RiskProfileId[] {
  return Object.keys(RISK_PROFILES) as RiskProfileId[];
}

/**
 * Detect if given parameters match a predefined risk profile.
 * Returns the profile ID if matched, null otherwise.
 */
export function detectRiskProfile(
  params: Partial<RiskProfileParams>
): RiskProfileId | null {
  const profiles = getAllRiskProfiles();

  for (const profile of profiles) {
    const p = profile.params;
    if (
      params.leverageMin === p.leverageMin &&
      params.leverageMax === p.leverageMax &&
      params.leverageTarget === p.leverageTarget
    ) {
      return profile.id;
    }
  }

  return null; // Custom configuration
}

/**
 * Check if a string is a valid RiskProfileId
 */
export function isValidRiskProfileId(id: string): id is RiskProfileId {
  return id in RISK_PROFILES;
}
