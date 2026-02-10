/**
 * Current portfolio state
 */
export interface PortfolioCurrentState {
  equity: number;
  exposure: number;
  leverage: number;
  marginRatio: number;
  peakEquity: number;
  pendingContributions: number;
  positionValues: Record<string, number>;
  positionQuantities: Record<string, number>;
}

/**
 * Deploy conditions evaluation
 */
export interface DeployConditions {
  drawdown: number;
  drawdownTriggered: boolean;
  weightDeviation: number;
  weightDeviationTriggered: boolean;
  volatility: number | null;
  volatilityTriggered: boolean;
  anyConditionTriggered: boolean;
  deployFraction: number;
}

/**
 * Purchase calculation for a single asset
 */
export interface PurchaseCalculation {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  quantity: number;
  unit: string;
  valueUsd: number;
  targetWeight: number;
  currentPrice: number;
}

/**
 * Extra contribution calculation
 */
export interface ExtraContributionCalculation {
  amount: number;
  currency: string;
  reason: string;
  currentLeverage: number;
  targetLeverage: number;
}

/**
 * Contribution reminder
 */
export interface ContributionReminder {
  suggestedAmount: number;
  currency: string;
}

/**
 * Notification actions based on type
 */
export interface NotificationActions {
  // For leverage_below_range: specific purchases
  purchases?: PurchaseCalculation[];
  totalPurchaseValue?: number;

  // For leverage_above_range: extra contribution needed
  extraContribution?: ExtraContributionCalculation;

  // For contribution_reminder: reminder
  contributionReminder?: ContributionReminder;
}

/**
 * Notification levels
 */
export type NotificationLevel = "info" | "warning" | "attention";

/**
 * Notification types
 */
export type NotificationType =
  | "contribution_reminder"
  | "leverage_below_range"
  | "leverage_above_range"
  | "deploy_condition_met"
  | "rebalance_deviation_detected";

/**
 * Single notification
 */
export interface Notification {
  type: NotificationType;
  level: NotificationLevel;
  title: string;
  description: string;
  actions?: NotificationActions;
  actionUrl?: string;
}

/**
 * Full notifications response
 */
export interface PortfolioNotificationsResponse {
  portfolioId: string;
  portfolioName: string;
  timestamp: string;

  // Current state
  currentState: PortfolioCurrentState;

  // Configuration summary
  configuration: {
    leverageMin: number;
    leverageMax: number;
    leverageTarget: number;
    monthlyContribution: number | null;
    contributionDayOfMonth: number;
    targetWeights: Record<string, number>;
  };

  // Deploy conditions
  conditions: DeployConditions;

  // Notifications list
  notifications: Notification[];

  // Contribution info
  isContributionDay: boolean;
  nextContributionDate: string | null;

  // Summary
  summary: {
    leverageStatus: "low" | "in_range" | "high";
    attentionRequired: boolean;
    primaryNotification: string | null;
  };
}
