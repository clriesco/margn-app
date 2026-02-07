import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../contexts/AuthContext";
import DashboardSidebar from "../../components/DashboardSidebar";
import { Recommendation, RecommendationPriority } from "../../lib/api";
import {
  usePortfolios,
  usePortfolioSummary,
  usePortfolioMetrics,
  useContributionHistory,
  usePortfolioRecommendations,
} from "../../lib/hooks/use-portfolio-data";
import { getProfile, UserProfile } from "../../lib/api";
import {
  Target,
  TrendingUp,
  TrendingDown,
  Rocket,
  Scale,
  Check,
  DollarSign,
  Edit,
  Calendar,
  BarChart,
  ChevronDown,
} from "lucide-react";
import {
  formatCurrencyES,
  formatPercentES,
  formatNumberES,
} from "../../lib/number-format";

/**
 * Asset unit mapping based on asset type
 */
const ASSET_UNITS: Record<string, string> = {
  commodity: "oz",
  crypto: "shares",
  index: "shares",
  bond: "shares",
  stock: "shares",
};

/**
 * Crypto symbol to currency symbol mapping
 */
const CRYPTO_SYMBOLS: Record<string, string> = {
  "BTC-USD": "₿",
  "ETH-USD": "Ξ",
  BTC: "₿",
  ETH: "Ξ",
};

/**
 * Get unit for an asset based on symbol and asset type
 */
function getUnitForAsset(symbol: string, assetType?: string): string {
  // Check if we have a currency symbol for this crypto (by symbol or base symbol)
  const baseSymbol = symbol.split("-")[0];

  // First, check if we have a crypto symbol defined (even if assetType is not set)
  if (CRYPTO_SYMBOLS[symbol]) {
    return CRYPTO_SYMBOLS[symbol];
  }
  if (CRYPTO_SYMBOLS[baseSymbol]) {
    return CRYPTO_SYMBOLS[baseSymbol];
  }

  // For crypto assets, use the currency symbol if available, otherwise use the base symbol
  if (assetType === "crypto") {
    // If no symbol found, return the base symbol (e.g., "SOL" for "SOL-USD")
    return baseSymbol;
  }

  // Fallback: if symbol looks like crypto (ends with -USD and we have common crypto patterns)
  // This handles cases where assetType might not be set correctly
  const commonCryptoSymbols = [
    "BTC",
    "ETH",
    "SOL",
    "ADA",
    "DOT",
    "MATIC",
    "AVAX",
    "LINK",
    "UNI",
    "AAVE",
  ];
  if (symbol.includes("-USD") && commonCryptoSymbols.includes(baseSymbol)) {
    return baseSymbol;
  }

  // Special cases: GLD and IAU are actually shares, not oz
  if (symbol === "GLD" || symbol === "IAU") {
    return "shares";
  }

  // Fall back to asset type
  if (assetType && ASSET_UNITS[assetType]) {
    return ASSET_UNITS[assetType];
  }

  // Default fallback
  return "shares";
}

interface Position {
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
    assetType?: string;
  };
}

interface PortfolioSummary {
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

interface AnalyticsStats {
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
 * Dashboard page with real portfolio data
 */
function Dashboard() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  // Use SWR hooks for cached data
  const {
    portfolios,
    isLoading: portfoliosLoading,
    error: portfoliosError,
  } = usePortfolios();
  const portfolioId = portfolios.length > 0 ? portfolios[0].id : null;

  const {
    summary,
    isLoading: summaryLoading,
    mutate: refreshSummary,
  } = usePortfolioSummary(portfolioId);
  const {
    metrics: metricsHistory,
    isLoading: metricsLoading,
    mutate: refreshMetrics,
  } = usePortfolioMetrics(portfolioId);
  const {
    recommendations,
    isLoading: recommendationsLoading,
    mutate: refreshRecommendations,
  } = usePortfolioRecommendations(portfolioId);
  const {
    history: contributionHistory,
    isLoading: contributionHistoryLoading,
    mutate: refreshContributionHistory,
  } = useContributionHistory(portfolioId);

  const [historyPage, setHistoryPage] = useState(1);
  const itemsPerPage = 24;
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [metricsExpanded, setMetricsExpanded] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > 768 : true
  );

  // Combined loading state
  const dataLoading =
    portfoliosLoading ||
    summaryLoading ||
    metricsLoading ||
    contributionHistoryLoading ||
    recommendationsLoading;
  const error = portfoliosError
    ? portfoliosError instanceof Error
      ? portfoliosError.message
      : String(portfoliosError)
    : null;

  const historyForTable = useMemo(() => {
    // Sort by date descending (most recent first)
    return [...contributionHistory]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [contributionHistory]);

  // Calculate pagination
  const totalPages = Math.ceil(historyForTable.length / itemsPerPage);
  const startIndex = (historyPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedHistory = historyForTable.slice(startIndex, endIndex);

  const analyticsStats = summary?.analytics ?? null;

  // All useEffect hooks must be before any conditional returns
  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Redirect to onboarding if no portfolio found (but not if there was an error)
  useEffect(() => {
    if (!portfoliosLoading && portfolios.length === 0 && user && !portfoliosError) {
      router.push("/dashboard/onboarding");
    }
  }, [portfoliosLoading, portfolios.length, user, portfoliosError, router]);

  // Handle authentication errors - sign out and redirect to login
  useEffect(() => {
    if (portfoliosError) {
      const errorMessage = portfoliosError.message?.toLowerCase() || "";
      const isAuthError =
        errorMessage.includes("unauthorized") ||
        errorMessage.includes("401") ||
        errorMessage.includes("jwt") ||
        errorMessage.includes("token");

      if (isAuthError) {
        console.log("[Dashboard] Auth error detected, signing out:", portfoliosError.message);
        signOut().then(() => {
          router.push("/");
        });
      }
    }
  }, [portfoliosError, signOut, router]);

  // Load user profile
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const profile = await getProfile();
        setUserProfile(profile);
      } catch (error) {
        console.error("Error loading profile:", error);
        // Don't show error, just fall back to email
      }
    }
    loadProfile();
  }, [user]);

  // Early returns after all hooks
  if (loading) {
    return (
      <>
        <Head>
          <title>Cargando... - Dashboard</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  if (!user) {
    return null;
  }

  // Show error state if portfolios failed to load (and it's not an auth error being handled)
  if (!portfoliosLoading && portfoliosError && portfolios.length === 0) {
    const errorMessage = portfoliosError.message?.toLowerCase() || "";
    const isAuthError =
      errorMessage.includes("unauthorized") ||
      errorMessage.includes("401") ||
      errorMessage.includes("jwt") ||
      errorMessage.includes("token");

    // Auth errors are handled by the useEffect above, show loading while signing out
    if (isAuthError) {
      return (
        <>
          <Head>
            <title>Sesión expirada - Dashboard</title>
          </Head>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "100vh",
              flexDirection: "column",
              gap: "1rem",
              padding: "2rem",
            }}
          >
            <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
              Sesión expirada. Redirigiendo al login...
            </p>
          </div>
        </>
      );
    }

    // Non-auth errors - show error with retry option
    return (
      <>
        <Head>
          <title>Error - Dashboard</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            flexDirection: "column",
            gap: "1rem",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p style={{ color: "var(--text-error, #ef4444)", fontSize: "1rem" }}>
            Error al cargar los datos del portfolio.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
            {portfoliosError.message || "Error desconocido"}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem",
              padding: "0.5rem 1rem",
              backgroundColor: "var(--primary)",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </>
    );
  }

  // Show loading while checking for portfolios or redirecting to onboarding
  if (!portfoliosLoading && portfolios.length === 0 && !portfoliosError) {
    return (
      <>
        <Head>
          <title>Redirigiendo... - Dashboard</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
            flexDirection: "column",
            gap: "1rem",
            padding: "2rem",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
            Redirigiendo al asistente de configuración...
          </p>
        </div>
      </>
    );
  }

  return (
    <React.Fragment>
      <Head>
        <title>Dashboard - Leveraged DCA App</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @media (max-width: 768px) {
            .dashboard-content-wrapper {
              padding: 1rem !important;
              padding-top: 4rem !important;
            }
            .dashboard-header {
              flex-direction: column !important;
              margin-bottom: 1.5rem !important;
            }
            .dashboard-header h1 {
              font-size: 1.5rem !important;
            }
            .metrics-grid {
              grid-template-columns: 1fr !important;
              gap: 1rem !important;
            }
            .analytics-grid {
              grid-template-columns: 1fr !important;
              gap: 0.75rem !important;
            }
            .metrics-collapse-chevron {
              display: block !important;
            }
            .metrics-collapse-toggle {
              cursor: pointer !important;
            }
            .positions-actions {
              display: none !important;
            }
            .positions-table-desktop {
              display: none !important;
            }
            .positions-cards-mobile {
              display: block !important;
            }
            .history-table-desktop {
              display: none !important;
            }
            .history-cards-mobile {
              display: block !important;
            }
          }
          @media (max-width: 480px) {
            .dashboard-content-wrapper {
              padding: 0.75rem !important;
              padding-top: 4rem !important;
            }
          }
          .positions-cards-mobile {
            display: none;
          }
          .position-card {
            background: var(--hover-bg);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1rem;
          }
          .position-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 0.75rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          }
          .position-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .position-card-label {
            color: var(--text-muted);
            font-size: 0.8125rem;
            font-weight: 500;
          }
          .position-card-value {
            color: var(--text-primary);
            font-size: 0.9375rem;
            font-weight: 600;
            text-align: right;
          }
          .history-cards-mobile {
            display: none;
          }
          .history-card {
            background: var(--hover-bg);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 12px;
            padding: 1rem;
            margin-bottom: 1rem;
          }
          .history-card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.75rem;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          }
          .history-card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }
          .history-card-label {
            color: var(--text-muted);
            font-size: 0.8125rem;
            font-weight: 500;
          }
          .history-card-value {
            color: var(--text-primary);
            font-size: 0.9375rem;
            font-weight: 600;
            text-align: right;
          }
          .composition-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
            margin-top: 0.5rem;
          }
          .composition-tag {
            border: 1px solid var(--border-light);
            border-radius: 999px;
            padding: 0.2rem 0.55rem;
            font-size: 0.75rem;
            color: var(--text-secondary);
          }
        `,
          }}
        />
      </Head>
      <DashboardSidebar portfolioId={portfolioId}>
        <div
          style={{
            padding: "2rem",
            paddingTop: "4rem",
          }}
          className="dashboard-content-wrapper"
        >
          <div style={{ maxWidth: "1600px", margin: "0 auto" }}>
            {/* Header */}
            <div
              style={{
                marginBottom: "2rem",
                paddingBottom: "1.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: "1rem",
              }}
              className="dashboard-header"
            >
              <div>
                <h1
                  style={{
                    fontSize: "1.875rem",
                    fontWeight: "700",
                    color: "var(--text-primary)",
                    marginBottom: "0.25rem",
                    letterSpacing: "-0.025em",
                  }}
                >
                  Mi portfolio
                </h1>
                <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                  {userProfile?.fullName && userProfile.fullName.trim() !== ""
                    ? userProfile.fullName
                    : user.email}
                </p>
              </div>
            </div>

            {/* Loading State - Skeletons */}
            {dataLoading && (
              <>
                {/* Summary Metrics Skeletons */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "1rem",
                    marginBottom: "2rem",
                  }}
                >
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "1.5rem",
                      }}
                    >
                      <div
                        style={{
                          height: "0.875rem",
                          background: "var(--bg-glass)",
                          borderRadius: "4px",
                          marginBottom: "0.75rem",
                          width: "60%",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                      <div
                        style={{
                          height: "1.75rem",
                          background: "var(--bg-glass)",
                          borderRadius: "4px",
                          width: "80%",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* Recommendations Skeleton */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      height: "1.25rem",
                      background: "var(--bg-glass)",
                      borderRadius: "4px",
                      marginBottom: "1rem",
                      width: "40%",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div
                    style={{
                      height: "4rem",
                      background: "var(--hover-bg)",
                      borderRadius: "8px",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                </div>

                {/* Chart Skeleton */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      height: "1.25rem",
                      background: "var(--bg-glass)",
                      borderRadius: "4px",
                      marginBottom: "1rem",
                      width: "30%",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div
                    style={{
                      height: "220px",
                      background: "var(--hover-bg)",
                      borderRadius: "8px",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                </div>

                {/* Analytics Skeleton */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: "1rem",
                    marginBottom: "2rem",
                  }}
                >
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div
                      key={i}
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "1rem",
                      }}
                    >
                      <div
                        style={{
                          height: "0.75rem",
                          background: "var(--bg-glass)",
                          borderRadius: "4px",
                          marginBottom: "0.5rem",
                          width: "70%",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                      <div
                        style={{
                          height: "1.5rem",
                          background: "var(--bg-glass)",
                          borderRadius: "4px",
                          width: "50%",
                          animation: "pulse 1.5s ease-in-out infinite",
                        }}
                      />
                    </div>
                  ))}
                </div>

                {/* History Table Skeleton */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      height: "1.25rem",
                      background: "var(--bg-glass)",
                      borderRadius: "4px",
                      marginBottom: "1rem",
                      width: "25%",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr>
                          {[1, 2, 3, 4, 5, 6].map((i) => (
                            <th
                              key={i}
                              style={{
                                padding: "0.875rem 1rem",
                                textAlign: "left",
                              }}
                            >
                              <div
                                style={{
                                  height: "0.875rem",
                                  background: "var(--bg-glass)",
                                  borderRadius: "4px",
                                  animation: "pulse 1.5s ease-in-out infinite",
                                }}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3, 4, 5].map((i) => (
                          <tr key={i}>
                            {[1, 2, 3, 4, 5, 6].map((j) => (
                              <td
                                key={j}
                                style={{
                                  padding: "1rem",
                                }}
                              >
                                <div
                                  style={{
                                    height: "1rem",
                                    background: "var(--hover-bg)",
                                    borderRadius: "4px",
                                    animation:
                                      "pulse 1.5s ease-in-out infinite",
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Positions Table Skeleton */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      height: "1.25rem",
                      background: "var(--bg-glass)",
                      borderRadius: "4px",
                      marginBottom: "1rem",
                      width: "25%",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr>
                          {[1, 2, 3, 4].map((i) => (
                            <th
                              key={i}
                              style={{
                                padding: "0.875rem 1rem",
                                textAlign: "left",
                              }}
                            >
                              <div
                                style={{
                                  height: "0.875rem",
                                  background: "var(--bg-glass)",
                                  borderRadius: "4px",
                                  animation: "pulse 1.5s ease-in-out infinite",
                                }}
                              />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[1, 2, 3].map((i) => (
                          <tr key={i}>
                            {[1, 2, 3, 4].map((j) => (
                              <td
                                key={j}
                                style={{
                                  padding: "1rem",
                                }}
                              >
                                <div
                                  style={{
                                    height: "1rem",
                                    background: "var(--hover-bg)",
                                    borderRadius: "4px",
                                    animation:
                                      "pulse 1.5s ease-in-out infinite",
                                  }}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Error State */}
            {error && (
              <div
                style={{
                  padding: "1.5rem",
                  background: "rgba(248, 113, 113, 0.1)",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                  borderRadius: "8px",
                  marginBottom: "2rem",
                }}
              >
                <p style={{ color: "#f87171" }}>{error}</p>
              </div>
            )}

            {/* Dashboard Content */}
            {!dataLoading && summary && (
              <>
                {/* Metrics Cards */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "1.5rem",
                    marginBottom: "2rem",
                  }}
                  className="metrics-grid"
                >
                  <MetricCard
                    title="Equity"
                    value={formatCurrencyES(summary.metrics.equity)}
                    subtitle="Valor del portfolio"
                  />
                  <MetricCard
                    title="Exposición"
                    value={formatCurrencyES(summary.metrics.exposure)}
                    subtitle="Total de posiciones"
                  />
                  <LeverageCard
                    leverage={summary.metrics.leverage}
                    leverageMin={summary.portfolio.leverageMin}
                    leverageMax={summary.portfolio.leverageMax}
                  />
                  <MetricCard
                    title="Retornos"
                    value={summary.metrics.twr !== null
                      ? formatPercentES(summary.metrics.twr)
                      : formatPercentES(summary.metrics.percentReturn / 100)}
                    subtitle={`${formatCurrencyES(
                      summary.metrics.absoluteReturn
                    )} PnL`}
                    positive={(summary.metrics.twr ?? summary.metrics.percentReturn / 100) >= 0}
                  />
                </div>

                {/* Recommendations Section */}
                {recommendations &&
                  recommendations.recommendations.length > 0 && (
                    <div
                      style={{
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        padding: "1.5rem",
                        marginBottom: "2rem",
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "1.125rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          marginBottom: "1.25rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Target size={20} />
                          Recomendaciones
                        </div>
                      </h2>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "1rem",
                        }}
                      >
                        {recommendations.recommendations.map((rec, idx) => (
                          <DashboardRecommendationCard
                            key={`${rec.type}-${idx}`}
                            recommendation={rec}
                            router={router}
                            portfolioId={portfolioId}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                {/* Analytics Grid */}
                {analyticsStats && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "1.5rem",
                      marginBottom: "2rem",
                    }}
                  >
                    <button
                      onClick={() => setMetricsExpanded((v) => !v)}
                      className="metrics-collapse-toggle"
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "none",
                        border: "none",
                        padding: 0,
                        marginBottom: metricsExpanded ? "1rem" : 0,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "1.125rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          margin: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <BarChart size={20} />
                        Métricas
                      </h2>
                      <ChevronDown
                        size={20}
                        className="metrics-collapse-chevron"
                        style={{
                          color: "var(--text-dim)",
                          transform: metricsExpanded ? "rotate(180deg)" : "rotate(0)",
                          transition: "transform 0.2s",
                          display: "none",
                        }}
                      />
                    </button>
                    <div
                      style={{
                        display: metricsExpanded ? "grid" : "none",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: "1rem",
                      }}
                      className="analytics-grid"
                    >
                      {[
                        {
                          label: "Capital final",
                          value: formatCurrencyES(analyticsStats.capitalFinal),
                          description:
                            "Valor total del equity al final del período analizado.",
                        },
                        {
                          label: "Total invertido",
                          value: formatCurrencyES(analyticsStats.totalInvested),
                          description:
                            "Suma del capital inicial más todas las aportaciones realizadas durante el período.",
                        },
                        {
                          label: "Retorno absoluto (PnL)",
                          value: formatCurrencyES(
                            analyticsStats.absoluteReturn
                          ),
                          description:
                            "Ganancia o pérdida total: (Equity + Retiros) - Total Depositado.",
                        },
                        {
                          label: "TWR",
                          value: analyticsStats.twr !== null
                            ? formatPercentES(analyticsStats.twr)
                            : "—",
                          description:
                            "Time-Weighted Return. Retorno ponderado por tiempo que elimina el efecto de aportaciones y retiros. Estándar de la industria para medir rendimiento.",
                        },
                        {
                          label: "CAGR",
                          value: formatPercentES(analyticsStats.cagr),
                          description:
                            "Tasa de crecimiento anual compuesta. No ajusta por contribuciones — usar XIRR para comparar con benchmarks.",
                        },
                        {
                          label: "XIRR",
                          value: analyticsStats.xirr !== null
                            ? formatPercentES(analyticsStats.xirr)
                            : "—",
                          description:
                            "Tasa interna de retorno extendida. Retorno anualizado ajustado por el timing de cada contribución.",
                        },
                        {
                          label: "Volatilidad anual",
                          value: formatPercentES(analyticsStats.volatility),
                          description:
                            "Desviación estándar anualizada de los retornos diarios. Mide la variabilidad del portfolio.",
                        },
                        {
                          label: "Sharpe Ratio",
                          value: formatNumberES(analyticsStats.sharpe, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          }),
                          description:
                            "Relación entre el retorno excedente (sobre la tasa libre de riesgo) y la volatilidad. Valores más altos indican mejor relación riesgo-retorno.",
                        },
                        {
                          label: "Máximo Drawdown Equity",
                          value: formatPercentES(
                            Math.abs(analyticsStats.maxDrawdownEquity)
                          ),
                          description:
                            "Máxima caída porcentual del capital (equity) desde su pico histórico. Mide el peor retroceso experimentado.",
                        },
                        {
                          label: "Máximo Drawdown Exposure",
                          value: formatPercentES(
                            Math.abs(analyticsStats.maxDrawdownExposure)
                          ),
                          description:
                            "Máxima caída porcentual de la exposición total desde su pico histórico. Indica la reducción máxima en el valor de las posiciones.",
                        },
                        {
                          label: "Días bajo el agua",
                          value: analyticsStats.underwaterDays.toString(),
                          description:
                            "Número total de días donde el equity está por debajo del capital total invertido acumulado (inversión inicial + aportaciones).",
                        },
                        {
                          label: "Mejor día",
                          value: analyticsStats.bestDay
                            ? `${new Date(
                                analyticsStats.bestDay.date
                              ).toLocaleDateString("es-ES")} (${formatPercentES(
                                analyticsStats.bestDay.return
                              )})`
                            : "-",
                          description:
                            "Fecha y retorno del día con mayor ganancia porcentual, excluyendo aportaciones.",
                        },
                        {
                          label: "Peor día",
                          value: analyticsStats.worstDay
                            ? `${new Date(
                                analyticsStats.worstDay.date
                              ).toLocaleDateString("es-ES")} (${formatPercentES(
                                analyticsStats.worstDay.return
                              )})`
                            : "-",
                          description:
                            "Fecha y retorno del día con mayor pérdida porcentual, excluyendo aportaciones.",
                        },
                      ].map((stat) => (
                        <AnalyticsCard
                          key={stat.label}
                          label={stat.label}
                          value={stat.value}
                          description={stat.description}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Equity Chart */}
                {metricsHistory.length > 0 && (
                  <div
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      padding: "1.5rem",
                      marginBottom: "2rem",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: "600",
                        color: "var(--text-primary)",
                        marginBottom: "1rem",
                      }}
                    >
                      Historial de Equity
                    </h2>
                    <EquityChart data={metricsHistory} />
                  </div>
                )}

                {/* Summary Info */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      marginBottom: "1rem",
                    }}
                  >
                    Resumen
                  </h2>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(200px, 1fr))",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Total Depositado
                      </p>
                      <p
                        style={{
                          color: "var(--text-primary)",
                          fontSize: "1.1rem",
                          fontWeight: "600",
                        }}
                      >
                        {formatCurrencyES(summary.metrics.totalContributions)}
                      </p>
                    </div>
                    {summary.metrics.totalWithdrawn > 0 && (
                      <div>
                        <p
                          style={{
                            color: "var(--text-dim)",
                            fontSize: "0.8rem",
                            marginBottom: "0.25rem",
                          }}
                        >
                          Total Retirado
                        </p>
                        <p
                          style={{
                            color: "#f87171",
                            fontSize: "1.1rem",
                            fontWeight: "600",
                          }}
                        >
                          {formatCurrencyES(summary.metrics.totalWithdrawn)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Fecha de Inicio
                      </p>
                      <p
                        style={{
                          color: "var(--text-primary)",
                          fontSize: "1.1rem",
                          fontWeight: "600",
                        }}
                      >
                        {summary.metrics.startDate
                          ? new Date(
                              summary.metrics.startDate
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Última Actualización
                      </p>
                      <p
                        style={{
                          color: "var(--text-primary)",
                          fontSize: "1.1rem",
                          fontWeight: "600",
                        }}
                      >
                        {summary.metrics.lastUpdate
                          ? new Date(
                              summary.metrics.lastUpdate
                            ).toLocaleDateString()
                          : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Historical Records */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "1.125rem",
                      fontWeight: "600",
                      color: "var(--text-primary)",
                      marginBottom: "1rem",
                    }}
                  >
                    Historial de Movimientos
                  </h2>
                  <div
                    style={{
                      overflowX: "auto",
                      WebkitOverflowScrolling: "touch",
                      msOverflowStyle: "-ms-autohiding-scrollbar",
                    }}
                    className="table-container history-table-desktop"
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={{ ...tableHeaderStyle, width: "33%" }}>Fecha</th>
                          <th style={{ ...tableHeaderStyle, width: "33%" }}>Movimiento</th>
                          <th style={{ ...tableHeaderStyle, width: "34%" }}>Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.map((point, idx) => (
                          <tr
                            key={`${point.date}-${idx}`}
                            className="table-row-hoverable"
                            style={{
                              borderBottom:
                                idx < paginatedHistory.length - 1
                                  ? "1px solid var(--bg-body)"
                                  : "none",
                              background: idx % 2 === 1 ? "var(--hover-bg)" : "transparent",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <td style={tableCellStyle}>
                              {new Date(point.date).toLocaleDateString(
                                "es-ES",
                                {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </td>
                            <td style={{
                              ...tableCellStyle,
                              color: point.contribution < 0 ? "#f87171" : "#4ade80",
                            }}>
                              {point.contribution < 0 ? "−" : "+"}{formatCurrencyES(Math.abs(Math.round(point.contribution)))}
                            </td>
                            <td style={tableCellStyle}>
                              {formatCurrencyES(Math.round(point.cumulative))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards for History */}
                  <div className="history-cards-mobile">
                    {paginatedHistory.map((point, idx) => (
                      <div
                        key={`${point.date}-${idx}`}
                        className="history-card"
                      >
                        <div className="history-card-header">
                          <div>
                            <div
                              style={{
                                fontWeight: "600",
                                color: "var(--text-primary)",
                                fontSize: "1rem",
                              }}
                            >
                              {new Date(point.date).toLocaleDateString(
                                "es-ES",
                                {
                                  day: "numeric",
                                  month: "long",
                                  year: "numeric",
                                }
                              )}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontWeight: "700",
                                fontSize: "1.125rem",
                                color: "var(--text-primary)",
                              }}
                            >
                              {formatCurrencyES(Math.round(point.cumulative))}
                            </div>
                          </div>
                        </div>
                        <div className="history-card-row">
                          <span className="history-card-label">Movimiento</span>
                          <span className="history-card-value" style={{
                            color: point.contribution < 0 ? "#f87171" : "#4ade80",
                          }}>
                            {point.contribution < 0 ? "−" : "+"}{formatCurrencyES(Math.abs(Math.round(point.contribution)))}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination Controls */}
                  {totalPages > 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "1.5rem",
                        paddingTop: "1.5rem",
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <button
                        onClick={() =>
                          setHistoryPage((p) => Math.max(1, p - 1))
                        }
                        disabled={historyPage === 1}
                        style={{
                          padding: "0.5rem 1rem",
                          background:
                            historyPage === 1
                              ? "var(--hover-bg)"
                              : "var(--bg-card)",
                          color: historyPage === 1 ? "var(--text-dim)" : "var(--text-secondary)",
                          border: "1px solid var(--input-border)",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: historyPage === 1 ? "not-allowed" : "pointer",
                          opacity: historyPage === 1 ? 0.5 : 1,
                        }}
                      >
                        ← Anterior
                      </button>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.875rem",
                        }}
                      >
                        Página {historyPage} de {totalPages} (
                        {historyForTable.length} registros)
                      </span>
                      <button
                        onClick={() =>
                          setHistoryPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={historyPage === totalPages}
                        style={{
                          padding: "0.5rem 1rem",
                          background:
                            historyPage === totalPages
                              ? "var(--hover-bg)"
                              : "var(--bg-card)",
                          color:
                            historyPage === totalPages ? "var(--text-dim)" : "var(--text-secondary)",
                          border: "1px solid var(--input-border)",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor:
                            historyPage === totalPages
                              ? "not-allowed"
                              : "pointer",
                          opacity: historyPage === totalPages ? 0.5 : 1,
                        }}
                      >
                        Siguiente →
                      </button>
                    </div>
                  )}
                </div>

                {/* Positions Table */}
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "1.5rem",
                    marginBottom: "2rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <h2
                      style={{
                        fontSize: "1.125rem",
                        fontWeight: "600",
                        color: "var(--text-primary)",
                        margin: 0,
                      }}
                    >
                      Posiciones Actuales
                    </h2>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.75rem",
                        flexWrap: "wrap",
                      }}
                      className="positions-actions"
                    >
                      <button
                        onClick={() =>
                          router.push(
                            `/dashboard/manual-update?portfolioId=${portfolioId}`
                          )
                        }
                        style={{
                          padding: "0.5rem 1rem",
                          background: "rgba(59, 130, 246, 0.1)",
                          color: "#60a5fa",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(59, 130, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "rgba(59, 130, 246, 0.1)";
                        }}
                      >
                        <Edit size={18} />
                        <span>Actualización Manual</span>
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/dashboard/rebalance?portfolioId=${portfolioId}`
                          )
                        }
                        style={{
                          padding: "0.5rem 1rem",
                          background: "rgba(139, 92, 246, 0.1)",
                          color: "#a78bfa",
                          border: "1px solid rgba(139, 92, 246, 0.3)",
                          borderRadius: "6px",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "rgba(139, 92, 246, 0.2)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background =
                            "rgba(139, 92, 246, 0.1)";
                        }}
                      >
                        <Scale size={18} />
                        <span>Rebalancear Portfolio</span>
                      </button>
                    </div>
                  </div>
                  <div
                    style={{
                      overflowX: "auto",
                      WebkitOverflowScrolling: "touch",
                    }}
                    className="table-container positions-table-desktop"
                  >
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: "700px",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th style={tableHeaderStyle}>Activo</th>
                          <th style={tableHeaderStyle}>Peso</th>
                          <th style={tableHeaderStyle}>Cantidad</th>
                          <th style={tableHeaderStyle}>Precio Medio</th>
                          <th style={tableHeaderStyle}>Precio Actual</th>
                          <th style={tableHeaderStyle}>Valor</th>
                          <th style={tableHeaderStyle}>PNL</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.positions.map((pos: Position, idx: number) => (
                          <tr
                            key={pos.id}
                            className="table-row-hoverable"
                            style={{
                              borderBottom:
                                idx < summary.positions.length - 1
                                  ? "1px solid var(--bg-body)"
                                  : "none",
                              background: idx % 2 === 1 ? "var(--hover-bg)" : "transparent",
                              transition: "background 0.15s ease",
                            }}
                          >
                            <td style={tableCellStyle}>
                              <div style={{ fontWeight: "600" }}>
                                {pos.asset.name}
                              </div>
                              <div
                                style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}
                              >
                                {pos.asset.symbol}
                              </div>
                            </td>
                            <td style={tableCellStyle}>
                              {formatNumberES(pos.weight, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              %
                            </td>
                            <td style={tableCellStyle}>
                              {formatNumberES(pos.quantity, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 4,
                              })}{" "}
                              {getUnitForAsset(
                                pos.asset.symbol,
                                pos.asset.assetType
                              )}
                            </td>
                            <td style={tableCellStyle}>
                              {formatCurrencyES(pos.avgPrice, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td style={tableCellStyle}>
                              {formatCurrencyES(pos.currentPrice, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td style={tableCellStyle}>
                              {formatCurrencyES(pos.exposureUsd)}
                            </td>
                            <td
                              style={{
                                ...tableCellStyle,
                                color: pos.pnl >= 0 ? "#22c55e" : "#ef4444",
                                fontWeight: "600",
                              }}
                            >
                              <div>
                                {pos.pnl >= 0 ? "+" : ""}
                                {formatCurrencyES(pos.pnl)}
                              </div>
                              <div
                                style={{
                                  fontSize: "0.75rem",
                                  opacity: 0.8,
                                }}
                              >
                                {formatPercentES(pos.pnlPercent / 100)}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="positions-cards-mobile">
                    {summary.positions.map((pos: Position) => (
                      <div key={pos.id} className="position-card">
                        <div className="position-card-header">
                          <div>
                            <div
                              style={{
                                fontWeight: "600",
                                color: "var(--text-primary)",
                                fontSize: "1rem",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {pos.asset.name}
                            </div>
                            <div
                              style={{
                                color: "var(--text-dim)",
                                fontSize: "0.8125rem",
                              }}
                            >
                              {pos.asset.symbol}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                color: pos.pnl >= 0 ? "#22c55e" : "#ef4444",
                                fontWeight: "700",
                                fontSize: "1.125rem",
                                marginBottom: "0.25rem",
                              }}
                            >
                              {pos.pnl >= 0 ? "+" : ""}
                              {formatCurrencyES(pos.pnl)}
                            </div>
                            <div
                              style={{
                                color: pos.pnl >= 0 ? "#22c55e" : "#ef4444",
                                fontSize: "0.8125rem",
                                opacity: 0.9,
                              }}
                            >
                              {formatPercentES(pos.pnlPercent / 100)}
                            </div>
                          </div>
                        </div>
                        <div className="position-card-row">
                          <span className="position-card-label">Peso</span>
                          <span className="position-card-value">
                            {formatNumberES(pos.weight, {
                              minimumFractionDigits: 1,
                              maximumFractionDigits: 1,
                            })}
                            %
                          </span>
                        </div>
                        <div className="position-card-row">
                          <span className="position-card-label">Cantidad</span>
                          <span className="position-card-value">
                            {formatNumberES(pos.quantity, {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 4,
                            })}{" "}
                            {getUnitForAsset(
                              pos.asset.symbol,
                              pos.asset.assetType
                            )}
                          </span>
                        </div>
                        <div className="position-card-row">
                          <span className="position-card-label">
                            Precio Medio
                          </span>
                          <span className="position-card-value">
                            {formatCurrencyES(pos.avgPrice, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div className="position-card-row">
                          <span className="position-card-label">
                            Precio Actual
                          </span>
                          <span className="position-card-value">
                            {formatCurrencyES(pos.currentPrice, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        <div
                          className="position-card-row"
                          style={{ marginBottom: 0 }}
                        >
                          <span className="position-card-label">Valor</span>
                          <span
                            className="position-card-value"
                            style={{ fontSize: "1rem", fontWeight: "700" }}
                          >
                            {formatCurrencyES(pos.exposureUsd)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </DashboardSidebar>
    </React.Fragment>
  );
}

/**
 * Simple equity chart using SVG
 */
function EquityChart({ data }: { data: MetricsPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (data.length === 0) return null;

  const chartWidth = 800;
  const chartHeight = 260;
  const pad = { top: 12, right: 16, bottom: 32, left: 60 };
  const innerW = chartWidth - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;

  const firstEquity = data[0].equity;
  const lastEquity = data[data.length - 1].equity;
  const isPositive = lastEquity >= firstEquity;
  const lineColor = isPositive ? "#22c55e" : "#ef4444";

  const equities = data.map((d) => d.equity);
  const minEq = Math.min(...equities) * 0.95;
  const maxEq = Math.max(...equities) * 1.05;
  const range = Math.max(maxEq - minEq, 1);

  const sx = (i: number) => pad.left + (i / Math.max(data.length - 1, 1)) * innerW;
  const sy = (eq: number) => pad.top + innerH - ((eq - minEq) / range) * innerH;

  const polylinePoints = data.map((d, i) => `${sx(i).toFixed(1)},${sy(d.equity).toFixed(1)}`).join(" ");
  const areaPoints = `${sx(0).toFixed(1)},${sy(minEq).toFixed(1)} ${polylinePoints} ${sx(data.length - 1).toFixed(1)},${sy(minEq).toFixed(1)}`;

  // Y ticks — nice round numbers
  const rawStep = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) || rawStep;
  const yTicks: number[] = [];
  let tick = Math.ceil(minEq / niceStep) * niceStep;
  while (tick <= maxEq) { yTicks.push(tick); tick += niceStep; }

  // X ticks — ~5 date labels
  const tickIndices = Array.from(
    new Set([0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(r * (data.length - 1))))
  );

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    if (svgX < pad.left || svgX > chartWidth - pad.right) { setHoverIndex(null); return; }
    const ratio = (svgX - pad.left) / innerW;
    const idx = Math.round(ratio * (data.length - 1));
    setHoverIndex(Math.max(0, Math.min(data.length - 1, idx)));
  };

  // Display data: hovered point or last point
  const di = hoverIndex ?? data.length - 1;
  const dp = data[di];
  const dpReturn = (dp.equity - firstEquity) / firstEquity;
  const fmtPct = (v: number) => (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%";

  const panelLabelStyle: React.CSSProperties = {
    color: "var(--text-dim)", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.5px",
  };
  const panelValueStyle: React.CSSProperties = {
    color: "var(--text-primary)", fontWeight: "600", fontSize: "0.9375rem",
  };

  return (
    <div>
      {/* Info panel */}
      <div style={{
        display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap",
        padding: "0.625rem 1rem", marginBottom: "0.75rem",
        background: "var(--hover-bg)", border: "1px solid var(--border)", borderRadius: "6px",
        minHeight: "40px", fontSize: "0.8125rem",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          <span style={panelLabelStyle}>Fecha</span>
          <span style={panelValueStyle}>
            {new Date(dp.date).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <div style={{ width: "1px", height: "28px", background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          <span style={panelLabelStyle}>Equity</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={panelValueStyle}>{formatCurrencyES(dp.equity)}</span>
            <span style={{ color: dpReturn >= 0 ? "#34d399" : "#f87171", fontSize: "0.75rem", fontWeight: "500" }}>{fmtPct(dpReturn)}</span>
          </div>
        </div>
        <div style={{ width: "1px", height: "28px", background: "var(--border)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
          <span style={panelLabelStyle}>Leverage</span>
          <span style={panelValueStyle}>{dp.leverage.toFixed(2)}x</span>
        </div>
        {dp.drawdown != null && (
          <>
            <div style={{ width: "1px", height: "28px", background: "var(--border)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={panelLabelStyle}>Drawdown</span>
              <span style={{ ...panelValueStyle, color: dp.drawdown < -0.05 ? "#f87171" : "var(--text-secondary)" }}>
                {(dp.drawdown * 100).toFixed(1)}%
              </span>
            </div>
          </>
        )}
        {dp.pnl != null && (
          <>
            <div style={{ width: "1px", height: "28px", background: "var(--border)" }} />
            <div style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={panelLabelStyle}>PnL día</span>
              <span style={{ ...panelValueStyle, color: dp.pnl >= 0 ? "#34d399" : "#f87171" }}>
                {dp.pnl >= 0 ? "+" : ""}{formatCurrencyES(dp.pnl)}
              </span>
            </div>
          </>
        )}
        {hoverIndex === null && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ color: "var(--text-dim)", fontSize: "0.75rem", fontStyle: "italic" }}>
              Pasa el ratón por el gráfico
            </span>
          </>
        )}
      </div>

      {/* SVG chart */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="eq-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.15" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid + Y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={chartWidth - pad.right} y1={sy(t)} y2={sy(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={pad.left - 8} y={sy(t) + 4} fill="var(--text-dim)" fontSize="10" textAnchor="end" fontFamily="monospace">
              {formatNumberES(t / 1000, { maximumFractionDigits: 0 })}k
            </text>
          </g>
        ))}

        {/* X labels */}
        {tickIndices.map((idx) => (
          <text key={idx} x={sx(idx)} y={chartHeight - 8} fill="var(--text-dim)" fontSize="10" textAnchor="middle" fontFamily="monospace">
            {new Date(data[idx].date).toLocaleDateString("es-ES", { month: "short", year: "2-digit" })}
          </text>
        ))}

        {/* Area fill */}
        <polygon fill="url(#eq-gradient)" points={areaPoints} />

        {/* Line */}
        <polyline fill="none" stroke={lineColor} strokeWidth="2" points={polylinePoints} />

        {/* Hover crosshair + dot */}
        {hoverIndex !== null && (
          <g>
            <line x1={sx(hoverIndex)} x2={sx(hoverIndex)} y1={pad.top} y2={chartHeight - pad.bottom} stroke="var(--border-light)" strokeWidth="1" />
            <circle cx={sx(hoverIndex)} cy={sy(data[hoverIndex].equity)} r="4" fill={lineColor} stroke="var(--bg-body)" strokeWidth="1.5" />
          </g>
        )}

        {/* Axis borders */}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={chartHeight - pad.bottom} stroke="var(--border)" strokeWidth="1" />
        <line x1={pad.left} x2={chartWidth - pad.right} y1={chartHeight - pad.bottom} y2={chartHeight - pad.bottom} stroke="var(--border)" strokeWidth="1" />
      </svg>
    </div>
  );
}

function AnalyticsCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      style={{
        background: "var(--hover-bg)",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        borderRadius: "12px",
        padding: "1rem",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.25rem",
        }}
      >
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.75rem",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          {label}
        </p>
        {description && (
          <div
            style={{ position: "relative", display: "inline-block" }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                color: "var(--text-dim)",
                cursor: "help",
                flexShrink: 0,
              }}
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            {showTooltip && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginBottom: "0.5rem",
                  background: "var(--bg-card)",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                  width: "280px",
                  zIndex: 1100,
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                  pointerEvents: "none",
                }}
              >
                {description}
                <div
                  style={{
                    position: "absolute",
                    bottom: "-6px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 0,
                    height: 0,
                    borderLeft: "6px solid transparent",
                    borderRight: "6px solid transparent",
                    borderTop: "6px solid rgba(148, 163, 184, 0.3)",
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <p
        style={{
          color: "var(--text-primary)",
          fontSize: "1.1rem",
          fontWeight: "600",
          margin: 0,
        }}
      >
        {value}
      </p>
    </div>
  );
}

// Format functions are now imported from lib/number-format.ts

/**
 * Metric card component
 */
function MetricCard({
  title,
  value,
  subtitle,
  positive,
}: {
  title: string;
  value: string;
  subtitle: string;
  positive?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.25rem",
      }}
    >
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.8125rem",
          marginBottom: "0.5rem",
          fontWeight: "500",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize: "1.75rem",
          fontWeight: "700",
          color:
            positive !== undefined
              ? positive
                ? "#22c55e"
                : "#ef4444"
              : "var(--text-primary)",
          marginBottom: "0.25rem",
        }}
      >
        {value}
      </p>
      <p style={{ color: "var(--text-dim)", fontSize: "0.75rem" }}>{subtitle}</p>
    </div>
  );
}

/**
 * Leverage card with visual indicator bar
 * Bar gradient: 20% yellow→green | 60% green | 20% green→red
 * Marker position: left edge if < min, right edge if > max, proportional otherwise
 */
function LeverageCard({
  leverage,
  leverageMin,
  leverageMax,
}: {
  leverage: number;
  leverageMin: number;
  leverageMax: number;
}) {
  // Calculate marker position (0-100%)
  // Zone 1 (0-20%): below min (yellow → green)
  // Zone 2 (20-80%): in range (green)
  // Zone 3 (80-100%): above max (green → red)
  // Position: 0% if below min, 100% if above max, 20-80% if in range

  let markerPercent: number;
  if (leverage < leverageMin) {
    markerPercent = 0;
  } else if (leverage > leverageMax) {
    markerPercent = 100;
  } else {
    // In range: map proportionally from 20% to 80%
    const rangePosition = (leverage - leverageMin) / (leverageMax - leverageMin);
    markerPercent = 20 + rangePosition * 60;
  }

  // Determine status color for the value text
  let valueColor: string;
  if (leverage < leverageMin) {
    valueColor = "#eab308"; // Yellow
  } else if (leverage > leverageMax) {
    valueColor = "#ef4444"; // Red
  } else {
    valueColor = "#22c55e"; // Green
  }

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.25rem",
      }}
    >
      <p
        style={{
          color: "var(--text-muted)",
          fontSize: "0.8125rem",
          marginBottom: "0.5rem",
          fontWeight: "500",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Leverage
      </p>
      <p
        style={{
          fontSize: "1.75rem",
          fontWeight: "700",
          color: valueColor,
          marginBottom: "0.5rem",
        }}
      >
        {formatNumberES(leverage, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}x
      </p>

      {/* Leverage bar */}
      <div
        style={{
          position: "relative",
          height: "8px",
          borderRadius: "4px",
          marginBottom: "0.5rem",
          background: `linear-gradient(to right,
            #eab308 0%,
            #22c55e 20%,
            #22c55e 80%,
            #ef4444 100%
          )`,
        }}
      >
        {/* Marker */}
        <div
          style={{
            position: "absolute",
            top: "-3px",
            left: `${markerPercent}%`,
            transform: "translateX(-50%)",
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            background: "white",
            border: `3px solid ${valueColor}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
          }}
        />
      </div>

      {/* Range labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          color: "var(--text-dim)",
          fontSize: "0.6875rem",
        }}
      >
        <span>{formatNumberES(leverageMin, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</span>
        <span>{formatNumberES(leverageMax, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</span>
      </div>
    </div>
  );
}

const tableHeaderStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  fontWeight: "600",
  textAlign: "left",
  padding: "0.875rem 1rem",
  fontSize: "0.8125rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const tableCellStyle: React.CSSProperties = {
  color: "var(--text-secondary)",
  padding: "1rem",
  fontSize: "0.9375rem",
};

/**
 * Priority colors and labels for recommendations
 */
const PRIORITY_CONFIG: Record<
  RecommendationPriority,
  { color: string; bg: string; border: string; label: string }
> = {
  urgent: {
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.1)",
    border: "rgba(239, 68, 68, 0.4)",
    label: "URGENTE",
  },
  high: {
    color: "#f59e0b",
    bg: "rgba(245, 158, 11, 0.1)",
    border: "rgba(245, 158, 11, 0.4)",
    label: "ALTA",
  },
  medium: {
    color: "#3b82f6",
    bg: "rgba(59, 130, 246, 0.1)",
    border: "rgba(59, 130, 246, 0.4)",
    label: "MEDIA",
  },
  low: {
    color: "#22c55e",
    bg: "rgba(34, 197, 94, 0.1)",
    border: "rgba(34, 197, 94, 0.4)",
    label: "BAJA",
  },
};

/**
 * Type icons for recommendations
 */
const TYPE_ICONS: Record<
  string,
  React.ComponentType<{ size?: number; color?: string }>
> = {
  contribution_due: Calendar,
  leverage_low: TrendingDown,
  leverage_high: TrendingUp,
  deploy_signal: Rocket,
  rebalance_needed: Scale,
  in_range: Check,
};

/**
 * Simplified recommendation card for dashboard
 */
function DashboardRecommendationCard({
  recommendation,
  router,
  portfolioId,
}: {
  recommendation: Recommendation;
  router: ReturnType<typeof useRouter>;
  portfolioId: string | null;
}) {
  const priorityConfig = PRIORITY_CONFIG[recommendation.priority];
  const IconComponent = TYPE_ICONS[recommendation.type] || Target;

  return (
    <div
      style={{
        background: priorityConfig.bg,
        border: `1px solid ${priorityConfig.border}`,
        borderRadius: "12px",
        padding: "1.25rem",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <IconComponent size={24} color={priorityConfig.color} />
          <div>
            <h3
              style={{
                color: "var(--text-primary)",
                fontSize: "1.1rem",
                fontWeight: "600",
                margin: 0,
              }}
            >
              {recommendation.title}
            </h3>
          </div>
        </div>
        <span
          style={{
            background: priorityConfig.color,
            color: "white",
            fontSize: "0.7rem",
            fontWeight: "700",
            padding: "0.25rem 0.75rem",
            borderRadius: "4px",
          }}
        >
          {priorityConfig.label}
        </span>
      </div>

      {/* Description */}
      <p style={{ color: "var(--text-secondary)", marginBottom: "1rem", lineHeight: "1.5" }}>
        {recommendation.description}
      </p>

      {/* Actions - Purchases (simplified) */}
      {recommendation.actions?.purchases &&
        recommendation.actions.purchases.length > 0 && (
          <div
            style={{
              background: "rgba(0,0,0,0.2)",
              borderRadius: "8px",
              padding: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.8rem",
                marginBottom: "0.5rem",
                fontWeight: "600",
              }}
            >
              Compras Recomendadas: {recommendation.actions.purchases.length}{" "}
              activos
            </p>
            <p
              style={{
                color: "var(--text-primary)",
                fontSize: "0.9rem",
                fontWeight: "600",
              }}
            >
              Total:{" "}
              {recommendation.actions.totalPurchaseValue
                ? formatCurrencyES(recommendation.actions.totalPurchaseValue)
                : formatCurrencyES(0)}
            </p>
          </div>
        )}

      {/* Actions - Extra Contribution */}
      {recommendation.actions?.extraContribution && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "8px",
            padding: "0.75rem",
            marginBottom: "0.5rem",
          }}
        >
          <p
            style={{
              color: "#f87171",
              fontWeight: "600",
              marginBottom: "0.25rem",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <DollarSign size={16} />
              Aporte Extra Necesario
            </div>
          </p>
          <p
            style={{
              color: "var(--text-primary)",
              fontSize: "1.25rem",
              fontWeight: "700",
            }}
          >
            {formatCurrencyES(
              Math.ceil(recommendation.actions.extraContribution.amount)
            )}
          </p>
        </div>
      )}

      {/* Actions - Contribution Reminder */}
      {recommendation.actions?.contributionReminder && (
        <div
          style={{
            background: "rgba(59, 130, 246, 0.15)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "8px",
            padding: "0.75rem",
            marginBottom: "0.5rem",
          }}
        >
          <p style={{ color: "#60a5fa", fontWeight: "600" }}>
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            >
              <DollarSign size={16} />
              Aportación Sugerida
            </div>
          </p>
          <p
            style={{
              color: "var(--text-primary)",
              fontSize: "1.25rem",
              fontWeight: "700",
            }}
          >
            {formatCurrencyES(
              recommendation.actions.contributionReminder.suggestedAmount
            )}
          </p>
        </div>
      )}

      {/* Action Button */}
      {recommendation.actionUrl && (
        <div style={{ marginTop: "1rem", textAlign: "right" }}>
          <button
            onClick={() => {
              let url = recommendation.actionUrl!;
              if (!url.includes("portfolioId") && portfolioId) {
                url += url.includes("?")
                  ? `&portfolioId=${portfolioId}`
                  : `?portfolioId=${portfolioId}`;
              }
              router.push(url);
            }}
            style={{
              padding: "0.625rem 1.25rem",
              background: priorityConfig.color,
              color: "white",
              border: "none",
              borderRadius: "6px",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Ir a la acción →
          </button>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
