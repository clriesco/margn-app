/**
 * Email notification types matching the portfolio notification system
 */
export type EmailNotificationType =
  | "contribution_reminder"
  | "leverage_below_range"
  | "leverage_above_range"
  | "margin_ratio_alert";

/**
 * Mapping from notification types to user preference fields
 */
export const NOTIFICATION_PREFERENCE_MAP: Record<
  EmailNotificationType,
  "notifyOnContributions" | "notifyOnLeverageAlerts" | "notifyOnRebalance" | "notifyOnNotifications"
> = {
  contribution_reminder: "notifyOnContributions",
  leverage_below_range: "notifyOnLeverageAlerts",
  leverage_above_range: "notifyOnLeverageAlerts",
  margin_ratio_alert: "notifyOnLeverageAlerts",
};

/**
 * Cool-down periods in hours per notification type
 */
export const COOLDOWN_HOURS: Record<EmailNotificationType, number> = {
  contribution_reminder: 24, // Once per contribution day
  leverage_below_range: 48,
  leverage_above_range: 48,
  margin_ratio_alert: 24, // Critical: shorter cool-down
};

/**
 * Max emails per user per day
 */
export const DAILY_EMAIL_CAP = 2;

/**
 * Max consecutive sends of the same notification type before back-off.
 * After this many sends (within 14 days), the notification is suppressed
 * until the condition resolves and the count resets.
 */
export const PROGRESSIVE_BACKOFF_LIMIT = 3;

/**
 * Notification types that are suppressed when margin_ratio_alert is present.
 * Margin alerts are more critical and already cover the leverage issue.
 */
export const MARGIN_SUPPRESSES: EmailNotificationType[] = [
  "leverage_above_range",
  "leverage_below_range",
];

/**
 * Parameters for sending a notification email
 */
export interface SendEmailParams {
  userId: string;
  email: string;
  portfolioId: string;
  portfolioName: string;
  notificationType: EmailNotificationType;
  subject: string;
  html: string;
}

/**
 * Data passed to email templates
 */
export interface ContributionReminderData {
  portfolioName: string;
  configuredAmount: number;
  currentEquity: number;
  currentLeverage: number;
  contributionUrl: string;
}

export interface LeverageAlertData {
  portfolioName: string;
  currentLeverage: number;
  leverageMin: number;
  leverageMax: number;
  direction: "above" | "below";
  extraContributionAmount?: number;
  actionUrl: string;
}

export interface MarginAlertData {
  portfolioName: string;
  marginRatio: number;
  currentEquity: number;
  currentExposure: number;
  level: "warning" | "critical";
  dashboardUrl: string;
}
