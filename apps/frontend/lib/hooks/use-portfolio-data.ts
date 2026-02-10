import useSWR, { mutate } from "swr";
import { useAuth } from "../auth";
import {
  getPortfoliosByEmail,
  getPortfolioSummary,
  getPortfolioMetrics,
  getContributionHistory,
  getPortfolioNotifications,
  getPortfolioConfiguration,
  getRiskProfiles,
  PortfolioSummary,
  PortfolioConfiguration,
  PortfolioNotificationsResponse,
  RiskProfile,
} from "../api";
import { swrConfig } from "../swr-config";

interface MetricsPoint {
  date: string;
  equity: number;
  exposure: number;
  leverage: number;
  drawdown?: number;
  contribution?: number;
  pnl?: number;
  pnlPercent?: number;
  metadata?: {
    composition?: Array<{
      symbol: string;
      weight: number;
      value?: number;
      quantity?: number;
    }>;
  } | null;
}

/**
 * Hook to get user's portfolios (cached)
 */
export function usePortfolios() {
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR(
    user?.email ? `portfolios-${user.email}` : null,
    () => getPortfoliosByEmail(user!.email!),
    {
      ...swrConfig,
      // Portfolios don't change often, cache for 10 minutes
      revalidateIfStale: false,
    }
  );

  return {
    portfolios: data || [],
    isLoading,
    error,
    mutate, // Allow manual refresh
  };
}

/**
 * Hook to get portfolio summary (cached)
 */
export function usePortfolioSummary(portfolioId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PortfolioSummary>(
    portfolioId ? `portfolio-summary-${portfolioId}` : null,
    () => getPortfolioSummary(portfolioId!),
    {
      ...swrConfig,
      // Summary changes more frequently, but still cache for 2 minutes
      revalidateIfStale: true,
    }
  );

  return {
    summary: data || null,
    isLoading,
    error,
    mutate, // Allow manual refresh
  };
}

/**
 * Hook to get portfolio metrics history (cached)
 */
export function usePortfolioMetrics(portfolioId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<MetricsPoint[]>(
    portfolioId ? `portfolio-metrics-${portfolioId}` : null,
    () => getPortfolioMetrics(portfolioId!),
    {
      ...swrConfig,
      // Metrics history doesn't change often, cache for 5 minutes
      revalidateIfStale: false,
    }
  );

  return {
    metrics: data || [],
    isLoading,
    error,
    mutate, // Allow manual refresh
  };
}

interface ContributionHistoryPoint {
  date: string;
  contribution: number;
  cumulative: number;
  type: string;
}

/**
 * Hook to get contribution history for the dashboard table (cached)
 */
export function useContributionHistory(portfolioId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<ContributionHistoryPoint[]>(
    portfolioId ? `contribution-history-${portfolioId}` : null,
    () => getContributionHistory(portfolioId!),
    {
      ...swrConfig,
      revalidateIfStale: false,
    }
  );

  return {
    history: data || [],
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to get portfolio notifications (cached)
 * Notifications change more frequently, so shorter cache
 */
export function usePortfolioNotifications(portfolioId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PortfolioNotificationsResponse>(
    portfolioId ? `portfolio-notifications-${portfolioId}` : null,
    () => getPortfolioNotifications(portfolioId!),
    {
      ...swrConfig,
      // Notifications can change, but cache for 1 minute
      revalidateIfStale: true,
      // Don't fail if notifications fail
      shouldRetryOnError: false,
    }
  );

  return {
    notifications: data || null,
    isLoading,
    error,
    mutate, // Allow manual refresh
  };
}

/**
 * Hook to get portfolio configuration (cached)
 */
export function usePortfolioConfiguration(portfolioId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PortfolioConfiguration>(
    portfolioId ? `portfolio-configuration-${portfolioId}` : null,
    () => getPortfolioConfiguration(portfolioId!),
    {
      ...swrConfig,
      revalidateIfStale: false,
    }
  );

  return {
    configuration: data || null,
    isLoading,
    error,
    mutate,
  };
}

/**
 * Hook to get risk profiles (cached, public endpoint)
 */
export function useRiskProfiles() {
  const { data, error, isLoading } = useSWR<RiskProfile[]>(
    "risk-profiles",
    () => getRiskProfiles(),
    {
      ...swrConfig,
      revalidateIfStale: false,
    }
  );

  return {
    riskProfiles: data || [],
    isLoading,
    error,
  };
}

/**
 * Invalidate all portfolio-related cache for a specific portfolio
 * Use this after operations that modify portfolio data (rebalance, position updates, etc.)
 *
 * @param portfolioId - Portfolio ID to invalidate cache for
 * @param userEmail - User email (optional, for portfolios list)
 */
export function invalidatePortfolioCache(portfolioId: string | null, userEmail?: string) {
  if (portfolioId) {
    // Invalidate all cache keys for this portfolio
    mutate(`portfolio-summary-${portfolioId}`, undefined, { revalidate: true });
    mutate(`portfolio-metrics-${portfolioId}`, undefined, { revalidate: true });
    mutate(`portfolio-notifications-${portfolioId}`, undefined, { revalidate: true });
    mutate(`portfolio-configuration-${portfolioId}`, undefined, { revalidate: true });
  }

  if (userEmail) {
    // Invalidate portfolios list
    mutate(`portfolios-${userEmail}`, undefined, { revalidate: true });
  }
}

/**
 * Invalidate all portfolio cache (useful for global refresh)
 */
export function invalidateAllPortfolioCache(userEmail?: string) {
  if (userEmail) {
    mutate(`portfolios-${userEmail}`, undefined, { revalidate: true });
  }

  // Invalidate all portfolio-related keys (SWR will match keys starting with these prefixes)
  mutate(
    (key) => typeof key === 'string' && key.startsWith('portfolio-'),
    undefined,
    { revalidate: true }
  );
}
