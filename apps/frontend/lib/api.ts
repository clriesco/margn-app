/**
 * API client for backend communication
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003/api";

// Module-level token getter, injected by ClerkTokenProvider
let _tokenGetter: (() => Promise<string | null>) | null = null;

/**
 * Set the token getter function (called by ClerkTokenProvider)
 */
export function setTokenGetter(getter: () => Promise<string | null>) {
  _tokenGetter = getter;
}

/**
 * Type definitions
 */
export interface Position {
  id: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  exposureUsd: number;
  pnl: number;
  pnlPercent: number;
  weight: number;
  asset: {
    id: string;
    symbol: string;
    name: string;
  };
}

export interface AnalyticsStats {
  capitalFinal: number;
  totalInvested: number;
  totalWithdrawn: number;
  absoluteReturn: number;
  totalReturnPercent: number;
  twr: number | null;
  cagr: number;
  xirr: number | null;
  volatility: number;
  sharpe: number;
  maxDrawdownEquity: number;
  maxDrawdownExposure: number;
  underwaterDays: number;
  bestDay: { date: string; return: number } | null;
  worstDay: { date: string; return: number } | null;
}

export interface PortfolioSummary {
  portfolio: {
    id: string;
    name: string;
    leverageMin: number;
    leverageMax: number;
  };
  metrics: {
    equity: number;
    exposure: number;
    leverage: number;
    totalContributions: number;
    totalWithdrawn: number;
    absoluteReturn: number;
    percentReturn: number;
    twr: number | null;
    startDate: string;
    lastUpdate: string;
  };
  positions: Position[];
  analytics: AnalyticsStats;
}

/**
 * Fetch wrapper with auth headers
 * Token is obtained from Clerk via the injected token getter.
 */
export async function fetchAPI(endpoint: string, options: RequestInit = {}) {
  const token = _tokenGetter ? await _tokenGetter() : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    // On 401, session is expired — Clerk middleware handles redirect
    if (response.status === 401 && typeof window !== "undefined") {
      window.location.href = "/";
      throw new Error("Session expired");
    }

    const error = await response
      .json()
      .catch(() => ({ message: "Network error" }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Get current user from backend
 */
export async function getCurrentUser() {
  return fetchAPI("/auth/me");
}

/**
 * Get portfolios by user email
 */
export async function getPortfoliosByEmail(email: string) {
  return fetchAPI(`/portfolios?email=${encodeURIComponent(email)}`);
}

/**
 * Get portfolio details
 */
export async function getPortfolio(portfolioId: string) {
  return fetchAPI(`/portfolios/${portfolioId}`);
}

/**
 * Get portfolio summary (metrics + positions + returns)
 */
export async function getPortfolioSummary(portfolioId: string) {
  return fetchAPI(`/portfolios/${portfolioId}/summary`);
}

/**
 * Get portfolio metrics history
 */
export async function getPortfolioMetrics(portfolioId: string) {
  return fetchAPI(`/portfolios/${portfolioId}/metrics`);
}

/**
 * Get contribution history for dashboard table
 */
export async function getContributionHistory(portfolioId: string) {
  return fetchAPI(`/portfolios/${portfolioId}/contribution-history`);
}

/**
 * Register monthly contribution
 */
export async function createContribution(data: {
  portfolioId: string;
  amount: number;
  type?: "contribution" | "withdrawal";
  note?: string;
}) {
  return fetchAPI("/contributions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Update portfolio positions
 */
export async function updatePositions(data: {
  portfolioId: string;
  positions: Array<{
    symbol: string;
    quantity: number;
    avgPrice: number;
    source: string;
  }>;
  equity?: number;
}) {
  return fetchAPI("/positions", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Position in rebalance proposal
 */
export interface ProposalPosition {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  currentQuantity: number;
  currentValue: number;
  targetQuantity: number;
  targetValue: number;
  deltaQuantity: number;
  deltaValue: number;
  targetWeight: number;
  currentWeight: number;
  currentPrice: number;
  action: "BUY" | "SELL" | "HOLD";
}

/**
 * Rebalance proposal interface
 * Full interface matching backend RebalanceProposal
 */
export interface RebalanceProposal {
  // Current state
  currentEquity: number;
  currentExposure: number;
  currentLeverage: number;

  // Target state
  targetLeverage: number;
  targetExposure: number;

  // Deploy signals
  deployFraction: number;
  deploySignals: {
    drawdownTriggered: boolean;
    weightDeviationTriggered: boolean;
    volatilityTriggered: boolean;
  };

  // Metrics used for decision
  drawdown: number;
  peakEquity: number;
  weightDeviation: number;
  realizedVolatility: number | null;

  // Pending contribution
  pendingContribution: number;

  // Positions
  positions: ProposalPosition[];

  // Summary after rebalance
  summary: {
    newEquity: number;
    newExposure: number;
    newLeverage: number;
    equityUsedFromContribution: number;
    borrowIncrease: number;
  };

  // Weights used
  weightsUsed: Record<string, number>;
  dynamicWeightsComputed: boolean;
}

/**
 * Get rebalance simulation for a portfolio
 */
export async function getRebalanceSimulation(
  portfolioId: string
): Promise<RebalanceProposal> {
  return fetchAPI(`/portfolios/${portfolioId}/rebalance/simulation`);
}

/**
 * Apply a rebalance simulation
 */
export async function applyRebalanceSimulation(
  portfolioId: string,
  proposal: RebalanceProposal
): Promise<{ success: boolean; message: string }> {
  return fetchAPI(`/portfolios/${portfolioId}/rebalance/apply`, {
    method: "POST",
    body: JSON.stringify(proposal),
  });
}

/**
 * Get daily metrics for a portfolio (equity/exposure per day).
 */
export async function getPortfolioDailyMetrics(portfolioId: string) {
  return fetchAPI(`/portfolios/${portfolioId}/daily-metrics`);
}

// ============================================
// PORTFOLIO CONFIGURATION
// ============================================

/**
 * Target weight for an asset
 */
export interface TargetWeight {
  symbol: string;
  weight: number;
}

/**
 * Portfolio configuration interface
 */
export interface PortfolioConfiguration {
  id: string;
  name: string;
  monthlyContribution: number | null;
  contributionFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  contributionDayOfMonth: number;
  contributionEnabled: boolean;
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
  initialCapital: number;
  maintenanceMarginRatio: number;
  safeMarginRatio: number | null;
  criticalMarginRatio: number | null;
  drawdownRedeployThreshold: number;
  weightDeviationThreshold: number;
  volatilityLookbackDays: number;
  volatilityRedeployThreshold: number;
  gradualDeployFactor: number;
  useDynamicSharpeRebalance: boolean;
  sharpeWeightsLookbackMonths: number;
  meanReturnShrinkage: number;
  riskFreeRate: number;
  maxWeight: number;
  minWeight: number;
  targetWeights: TargetWeight[];
  riskProfile: RiskProfileId | null;
  riskProfileName: string | null;
}

/**
 * Update portfolio configuration DTO
 */
export interface UpdatePortfolioConfigurationDto {
  monthlyContribution?: number;
  contributionFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  contributionDayOfMonth?: number;
  contributionEnabled?: boolean;
  leverageMin?: number;
  leverageMax?: number;
  leverageTarget?: number;
  maintenanceMarginRatio?: number;
  safeMarginRatio?: number;
  criticalMarginRatio?: number;
  drawdownRedeployThreshold?: number;
  weightDeviationThreshold?: number;
  volatilityLookbackDays?: number;
  volatilityRedeployThreshold?: number;
  gradualDeployFactor?: number;
  useDynamicSharpeRebalance?: boolean;
  sharpeWeightsLookbackMonths?: number;
  meanReturnShrinkage?: number;
  riskFreeRate?: number;
  maxWeight?: number;
  minWeight?: number;
  targetWeights?: TargetWeight[];
  riskProfile?: RiskProfileId | null;
}

/**
 * Get portfolio configuration
 * Converts targetWeights from backend format (Record) to frontend format (Array)
 */
export async function getPortfolioConfiguration(
  portfolioId: string
): Promise<PortfolioConfiguration> {
  const response = await fetchAPI(`/portfolios/${portfolioId}/configuration`);

  // Convert targetWeights from Record<string, number> to TargetWeight[]
  const targetWeightsRecord = response.targetWeights || {};
  const targetWeights: TargetWeight[] = Object.entries(targetWeightsRecord).map(
    ([symbol, weight]) => ({ symbol, weight: weight as number })
  );

  return {
    ...response,
    targetWeights,
  };
}

/**
 * Update portfolio configuration
 * Converts targetWeights from frontend format (Array) to backend format (Record)
 */
export async function updatePortfolioConfiguration(
  portfolioId: string,
  data: UpdatePortfolioConfigurationDto
): Promise<PortfolioConfiguration> {
  // Convert targetWeights from TargetWeight[] to Record<string, number>
  let targetWeightsRecord: Record<string, number> | undefined;
  if (data.targetWeights) {
    targetWeightsRecord = {};
    for (const tw of data.targetWeights) {
      targetWeightsRecord[tw.symbol] = tw.weight;
    }
  }

  const payload = {
    ...data,
    targetWeights: targetWeightsRecord,
  };

  const response = await fetchAPI(`/portfolios/${portfolioId}/configuration`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

  // Convert response targetWeights back to array format
  const targetWeightsRecordRes = response.targetWeights || {};
  const targetWeights: TargetWeight[] = Object.entries(
    targetWeightsRecordRes
  ).map(([symbol, weight]) => ({ symbol, weight: weight as number }));

  return {
    ...response,
    targetWeights,
  };
}

// ============================================
// PORTFOLIO NOTIFICATIONS
// ============================================

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
 * Deploy conditions
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
 * Purchase calculation
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
 * Notification actions
 */
export interface NotificationActions {
  purchases?: PurchaseCalculation[];
  totalPurchaseValue?: number;
  extraContribution?: ExtraContributionCalculation;
  contributionReminder?: ContributionReminder;
}

export type NotificationLevel = "info" | "warning" | "attention";
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
  currentState: PortfolioCurrentState;
  configuration: {
    leverageMin: number;
    leverageMax: number;
    leverageTarget: number;
    monthlyContribution: number | null;
    contributionDayOfMonth: number;
    targetWeights: Record<string, number>;
  };
  conditions: DeployConditions;
  notifications: Notification[];
  isContributionDay: boolean;
  nextContributionDate: string | null;
  summary: {
    leverageStatus: "low" | "in_range" | "high";
    attentionRequired: boolean;
    primaryNotification: string | null;
  };
}

/**
 * Get portfolio notifications
 */
export async function getPortfolioNotifications(
  portfolioId: string
): Promise<PortfolioNotificationsResponse> {
  return fetchAPI(`/portfolios/${portfolioId}/notifications`);
}

// ============================================
// USER PROFILE
// ============================================

/**
 * User profile interface
 */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  notifyOnNotifications: boolean;
  notifyOnContributions: boolean;
  notifyOnLeverageAlerts: boolean;
  notifyOnRebalance: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Update profile DTO
 */
export interface UpdateProfileDto {
  fullName?: string;
  avatarUrl?: string | null;
  notifyOnNotifications?: boolean;
  notifyOnContributions?: boolean;
  notifyOnLeverageAlerts?: boolean;
  notifyOnRebalance?: boolean;
}

/**
 * Get current user profile
 */
export async function getProfile(): Promise<UserProfile> {
  return fetchAPI("/users/profile");
}

/**
 * Update current user profile
 */
export async function updateProfile(
  data: UpdateProfileDto
): Promise<UserProfile> {
  return fetchAPI("/users/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Search for symbols in Yahoo Finance
 */
export interface SymbolSearchResult {
  symbol: string;
  name: string;
  price: number | null;
  exchange: string;
}

export async function searchSymbols(
  query: string
): Promise<SymbolSearchResult[]> {
  if (!query || query.length < 1) {
    return [];
  }
  return fetchAPI(`/positions/search-symbols?q=${encodeURIComponent(query)}`);
}

// ============================================
// PORTFOLIO ONBOARDING
// ============================================

/**
 * Asset for onboarding
 */
export interface OnboardingAsset {
  symbol: string;
  name?: string;
  assetType?: string;
  price?: number | null;
}

/**
 * Create portfolio request
 */
export interface CreatePortfolioRequest {
  name: string;
  initialCapital: number;
  baseCurrency?: string;
  assets: OnboardingAsset[];
  weightAllocationMethod: "sharpe" | "manual" | "equal";
  targetWeights?: Record<string, number>;
  leverageMin?: number;
  leverageMax?: number;
  leverageTarget?: number;
  monthlyContribution?: number;
  contributionFrequency?: "weekly" | "biweekly" | "monthly" | "quarterly";
  contributionDayOfMonth?: number;
  contributionEnabled?: boolean;
  riskProfile?: "conservative" | "moderate" | "growth" | "aggressive";
}

/**
 * Create portfolio response
 */
export interface CreatePortfolioResponse {
  portfolio: {
    id: string;
    name: string;
    initialCapital: number;
    baseCurrency: string;
  };
  assetsCreated: number;
  historicalDataDownloaded: boolean;
  targetWeights: Record<string, number>;
  equalWeights: Record<string, number>;
  warnings?: string[];
}

/**
 * Create a new portfolio (onboarding)
 */
export async function createPortfolio(
  data: CreatePortfolioRequest
): Promise<CreatePortfolioResponse> {
  return fetchAPI("/portfolios", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Check if user needs onboarding
 */
export async function checkNeedsOnboarding(): Promise<{ needsOnboarding: boolean }> {
  return fetchAPI("/portfolios/needs-onboarding");
}

export async function getBacktestPrices(
  symbols: string[],
  from: string,
  to: string
): Promise<{ prices: Record<string, Record<string, number>>; earliestCommonDate: string }> {
  const params = new URLSearchParams({
    symbols: symbols.join(","),
    from,
    to,
  });
  return fetchAPI(`/backtest/prices?${params.toString()}`);
}

// ============================================
// RISK PROFILES
// ============================================

export type RiskProfileId = "conservative" | "moderate" | "growth" | "aggressive";

export interface RiskProfileParams {
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
  maintenanceMarginRatio: number;
  meanReturnShrinkage: number;
  maxWeight: number;
  minWeight: number;
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

/**
 * Get all available risk profiles (public endpoint, no auth required)
 */
export async function getRiskProfiles(): Promise<RiskProfile[]> {
  const response = await fetch(`${API_BASE_URL}/portfolios/risk-profiles`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================
// TARGET ASSETS
// ============================================

/**
 * Target asset response from the API
 */
export interface TargetAsset {
  id: string;
  symbol: string;
  name: string;
  assetType: string;
  targetWeight: number;
  enabled: boolean;
  hasPosition: boolean; // Whether there's an actual holding
  currentQuantity: number | null;
  currentValue: number | null;
}

/**
 * Get all target assets for a portfolio
 */
export async function getTargetAssets(portfolioId: string): Promise<TargetAsset[]> {
  return fetchAPI(`/portfolios/${portfolioId}/target-assets`);
}

/**
 * Add a new target asset to a portfolio
 */
export async function addTargetAsset(
  portfolioId: string,
  data: { symbol: string; targetWeight?: number }
): Promise<TargetAsset> {
  return fetchAPI(`/portfolios/${portfolioId}/target-assets`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * Update a target asset's weight or enabled status
 */
export async function updateTargetAsset(
  portfolioId: string,
  symbol: string,
  data: { targetWeight?: number; enabled?: boolean }
): Promise<TargetAsset> {
  return fetchAPI(`/portfolios/${portfolioId}/target-assets/${encodeURIComponent(symbol)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Remove a target asset from a portfolio
 */
export async function removeTargetAsset(
  portfolioId: string,
  symbol: string
): Promise<{ success: boolean }> {
  return fetchAPI(`/portfolios/${portfolioId}/target-assets/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
  });
}

/**
 * Bulk update all target assets (for weight reallocation)
 */
export async function bulkUpdateTargetAssets(
  portfolioId: string,
  assets: Array<{ symbol: string; targetWeight: number; enabled?: boolean }>
): Promise<TargetAsset[]> {
  return fetchAPI(`/portfolios/${portfolioId}/target-assets`, {
    method: 'PUT',
    body: JSON.stringify({ assets }),
  });
}

// ============================================
// STRATEGIES (PUBLIC)
// ============================================

/**
 * Summary of a public/platform strategy
 */
export interface PublicStrategySummary {
  id: string;
  name: string;
  description?: string | null;
  isPlatform?: boolean;
  isPublic?: boolean;
  riskProfileId?: string | null;
  authorName?: string | null;
  config: {
    symbols: string[];
    weights: Record<string, number>;
    leverageTarget: number;
    weightMode?: string;
    dynamicWeights?: boolean;
  };
  metrics: {
    p50: {
      finalCapital: number;
      cagr: number;
      sharpe: number;
      maxDrawdownEquity: number;
    };
    score?: {
      composite: number;
      dimensions: { dispersion: number; worstCase: number; sharpe: number; drawdown: number };
    };
    [key: string]: unknown;
  } | null;
}

/**
 * Get public strategies (platform + community)
 */
export async function getPublicStrategies(
  filters?: { riskProfileId?: string; type?: "platform" | "community" }
): Promise<PublicStrategySummary[]> {
  const params = new URLSearchParams();
  if (filters?.riskProfileId) params.set("riskProfileId", filters.riskProfileId);
  if (filters?.type) params.set("type", filters.type);
  const qs = params.toString();
  return fetchAPI(`/strategies/public${qs ? `?${qs}` : ""}`);
}

/**
 * Update strategy visibility (public/private toggle)
 */
export async function updateStrategyVisibility(
  strategyId: string,
  isPublic: boolean
): Promise<{ id: string; isPublic: boolean }> {
  return fetchAPI(`/strategies/${strategyId}/visibility`, {
    method: "PATCH",
    body: JSON.stringify({ isPublic }),
  });
}

/**
 * Create a new portfolio from a saved strategy
 */
export async function createPortfolioFromStrategy(
  strategyId: string,
  data: { name: string; initialCapital: number; monthlyContribution?: number }
): Promise<{ portfolioId: string; name: string }> {
  return fetchAPI(`/strategies/${strategyId}/create-portfolio`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Delete a portfolio
 */
export async function deletePortfolio(
  portfolioId: string
): Promise<{ success: boolean }> {
  return fetchAPI(`/portfolios/${portfolioId}`, {
    method: "DELETE",
  });
}
