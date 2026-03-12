import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../lib/auth";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { usePageState } from "../../lib/hooks/use-page-state";
import {
  getRebalanceSimulation,
  applyRebalanceSimulation,
  RebalanceProposal,
} from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import FeatureGate from "../../components/FeatureGate";
import { useSubscription } from "../../lib/hooks/use-subscription";
import { LegalDisclaimer } from "../../components/LegalDisclaimer";
import { invalidatePortfolioCache } from "../../lib/hooks/use-portfolio-data";
import { DollarSign, Lightbulb, Brain, ClipboardList } from "lucide-react";
import {
  formatCurrencyES,
  formatPercentES,
  formatNumberES,
} from "../../lib/number-format";

/**
 * Determine if an asset supports fractional shares (for display purposes)
 */
function isFractionalAsset(symbol: string, assetType?: string): boolean {
  if (symbol.endsWith('=X')) return true;  // Forex
  if (symbol.includes('-USD')) {
    const base = symbol.split('-')[0];
    if (base.length <= 5) return true;  // Crypto
  }
  if (assetType === 'crypto' || assetType === 'forex') return true;
  return false;
}

/**
 * Format quantity based on asset type
 * Fractional assets: up to 6 decimals, whole share assets: 0 decimals
 */
function formatQuantity(quantity: number, symbol: string, assetType?: string): string {
  const fractional = isFractionalAsset(symbol, assetType);
  return formatNumberES(quantity, {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractional ? 6 : 0,
  });
}

/**
 * Rebalance page — algorithm-calculated allocation simulation
 * based on user-defined parameters and market data
 */
export default function Rebalance() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const { hasAccess, isLoading: subLoading, tier } = useSubscription();

  const [proposal, setProposal] = useState<RebalanceProposal | null>(null);
  const [isCalculating, setIsCalculating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Confirmation mode: user can override execution prices before applying
  const [confirmMode, setConfirmMode] = useState(false);
  const [executionPrices, setExecutionPrices] = useState<Record<string, number>>({});

  // Track whether proposal was restored to skip API fetch
  const wasRestoredRef = useRef(false);

  // Persist proposal across navigation (short TTL: 5 min for market data)
  const { clear: clearPageState } = usePageState({
    key: 'rebalance',
    portfolioId,
    snapshot: () => ({ proposal }),
    restore: (saved) => {
      if (saved.proposal) {
        setProposal(saved.proposal);
        setIsCalculating(false);
        wasRestoredRef.current = true;
      }
    },
    deps: [proposal],
    ttlMs: 5 * 60 * 1000,
  });

  // Load portfolio and calculate proposal
  useEffect(() => {
    async function loadAndCalculate() {
      if (!user?.email || !portfolioId || subLoading || !hasAccess("pro")) return;
      if (wasRestoredRef.current) {
        wasRestoredRef.current = false;
        return;
      }

      setIsCalculating(true);
      setError("");

      try {
        // Get rebalance simulation from backend
        const proposalData = await getRebalanceSimulation(portfolioId);
        setProposal(proposalData);
      } catch (err) {
        console.error("Error calculating proposal:", err);
        setError(
          err instanceof Error ? err.message : "Error al calcular el reajuste"
        );
      } finally {
        setIsCalculating(false);
      }
    }

    if (user) {
      loadAndCalculate();
    }
  }, [user, loading, portfolioId, subLoading, tier]);

  // Enter confirmation mode: pre-fill execution prices with mark prices
  const handleAccept = () => {
    if (!proposal) return;
    const prices: Record<string, number> = {};
    for (const pos of proposal.positions) {
      if (pos.action !== "HOLD") {
        prices[pos.assetId] = pos.currentPrice;
      }
    }
    setExecutionPrices(prices);
    setConfirmMode(true);
  };

  const handleCancelConfirm = () => {
    setConfirmMode(false);
    setExecutionPrices({});
  };

  // Check if any execution price differs from mark price
  const hasCustomPrices = proposal
    ? proposal.positions.some(
        (pos) =>
          pos.action !== "HOLD" &&
          executionPrices[pos.assetId] !== undefined &&
          executionPrices[pos.assetId] !== pos.currentPrice
      )
    : false;

  // Recalculate summary values when execution prices change
  const adjustedSummary = React.useMemo(() => {
    if (!proposal || !confirmMode) return proposal?.summary;
    let newExposure = 0;
    for (const pos of proposal.positions) {
      const price = executionPrices[pos.assetId] ?? pos.currentPrice;
      newExposure += pos.targetQuantity * price;
    }
    // borrowedAmount stays the same: equity changes with exposure
    const originalBorrowed = proposal.summary.newExposure - proposal.summary.newEquity;
    const newEquity = newExposure - originalBorrowed;
    const newLeverage = newEquity > 0 ? newExposure / newEquity : 0;
    return {
      ...proposal.summary,
      newExposure,
      newEquity,
      newLeverage,
    };
  }, [proposal, confirmMode, executionPrices]);

  // Apply with actual execution prices
  const handleConfirm = async () => {
    if (!portfolioId || !proposal) return;

    setIsSubmitting(true);
    setError("");

    try {
      await applyRebalanceSimulation(portfolioId, proposal, hasCustomPrices ? executionPrices : undefined);

      // Invalidate cache so dashboard shows updated data
      invalidatePortfolioCache(portfolioId, user?.email);
      clearPageState();

      setMessage("Ajustes confirmados. Nueva composición guardada.");

      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al aplicar los ajustes"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
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
          <p style={{ color: "var(--text-primary)", fontSize: "1.2rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Reajuste de Portfolio - Margn</title>
      </Head>
      <DashboardSidebar>
        <FeatureGate requiredTier="pro" featureName="Rebalanceo con optimización Sharpe">
        <div style={{ padding: "2rem", paddingTop: "4rem" }}>
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
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
                  fontWeight: "700",
                  color: "var(--text-primary)",
                  marginBottom: "0.25rem",
                  letterSpacing: "-0.025em",
                }}
              >
                Reajuste de Portfolio
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Calcula qué comprar y qué vender para reequilibrar tu
                cartera
              </p>
            </div>

            <div style={{ marginBottom: "1.5rem" }}>
              <LegalDisclaimer text="Esta simulación calcula ajustes teóricos basados en tu configuración y datos de mercado. Los resultados son informativos y no constituyen asesoramiento financiero. Toda operación en tu broker es decisión y responsabilidad tuya." />
            </div>

            {isCalculating ? (
              <div
                style={{
                  background: "var(--bg-glass)",
                  borderRadius: "16px",
                  padding: "4rem 2rem",
                  backdropFilter: "blur(10px)",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    color: "var(--text-primary)",
                    fontSize: "1.2rem",
                    marginBottom: "1rem",
                  }}
                >
                  Calculando reajuste...
                </p>
                <p style={{ color: "var(--text-on-glass-muted)" }}>
                  Analizando tu portfolio y calculando los ajustes
                  necesarios
                </p>
              </div>
            ) : proposal ? (
              <>
                {/* Check if rebalance is needed */}
                {(() => {
                  const allHold = proposal.positions.every(
                    (pos) => pos.action === "HOLD"
                  );
                  const noBorrowIncrease =
                    Math.abs(proposal.summary.borrowIncrease) < 0.01;
                  const needsRebalance = !(allHold && noBorrowIncrease);

                  return !needsRebalance ? (
                    <div
                      style={{
                        background: "rgba(251, 191, 36, 0.1)",
                        border: "1px solid rgba(251, 191, 36, 0.3)",
                        borderRadius: "12px",
                        padding: "1.5rem",
                        marginBottom: "1.5rem",
                        textAlign: "center",
                      }}
                    >
                      <p
                        style={{
                          color: "var(--text-on-glass)",
                          fontSize: "1.1rem",
                          fontWeight: "600",
                          margin: 0,
                        }}
                      >
                        ✅ Tu portfolio está equilibrado
                      </p>
                      <p
                        style={{
                          color: "var(--text-on-glass)",
                          fontSize: "0.9rem",
                          marginTop: "0.5rem",
                          margin: 0,
                        }}
                      >
                        Todos los activos están en sus pesos objetivo. No
                        necesitas hacer nada.
                      </p>
                    </div>
                  ) : null;
                })()}

                {/* Current vs Target Summary */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <div
                    style={{
                      background: "var(--bg-glass)",
                      borderRadius: "12px",
                      padding: "1.5rem",
                    }}
                  >
                    <h3
                      style={{
                        color: "var(--text-on-glass)",
                        fontSize: "0.9rem",
                        marginBottom: "1rem",
                      }}
                    >
                      AHORA
                    </h3>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Equity:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatCurrencyES(proposal.currentEquity)}
                      </span>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Exposición:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatCurrencyES(proposal.currentExposure)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Apalancamiento:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatNumberES(proposal.currentLeverage, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        x
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(102, 126, 234, 0.1)",
                      border: "1px solid rgba(102, 126, 234, 0.3)",
                      borderRadius: "12px",
                      padding: "1.5rem",
                    }}
                  >
                    <h3
                      style={{
                        color: "var(--text-on-glass)",
                        fontSize: "0.9rem",
                        marginBottom: "1rem",
                      }}
                    >
                      DESPUÉS DEL REAJUSTE
                    </h3>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Equity:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatCurrencyES(adjustedSummary?.newEquity ?? proposal.summary.newEquity)}
                      </span>
                    </div>
                    <div style={{ marginBottom: "0.5rem" }}>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Exposición:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatCurrencyES(adjustedSummary?.newExposure ?? proposal.summary.newExposure)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-on-glass-muted)" }}>
                        Apalancamiento:{" "}
                      </span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "600" }}>
                        {formatNumberES(adjustedSummary?.newLeverage ?? proposal.summary.newLeverage, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                        x
                      </span>
                    </div>
                  </div>
                </div>

                {/* Weights Used */}
                <div
                  style={{
                    background: "var(--hover-bg)",
                    borderRadius: "12px",
                    padding: "1rem 1.5rem",
                    marginBottom: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <span
                      style={{
                        color: "var(--text-on-glass-muted)",
                        fontSize: "0.85rem",
                      }}
                    >
                      Pesos:
                    </span>
                    <span
                      style={{
                        color: proposal.dynamicWeightsComputed
                          ? "#a78bfa"
                          : "var(--text-muted)",
                        fontSize: "0.85rem",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                        {proposal.dynamicWeightsComputed ? (
                          <>
                            <Brain size={16} />
                            <span>Dinámicos (Optimizados Sharpe)</span>
                          </>
                        ) : (
                          <span>Estáticos (Configuración del portfolio)</span>
                        )}
                    </span>
                  </div>
                  <div
                    style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}
                  >
                    {Object.entries(proposal.weightsUsed).map(
                      ([symbol, weight]) => (
                        <span
                          key={symbol}
                          style={{
                            padding: "0.1875rem 0.5rem",
                            background: "var(--hover-bg)",
                            border: "1px solid var(--border-light)",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {symbol}:{" "}
                          {formatNumberES((weight as number) * 100, {
                            maximumFractionDigits: 0,
                          })}
                          %
                        </span>
                      )
                    )}
                  </div>
                </div>

                {/* Instructions Table */}
                <div
                  style={{
                    background: "var(--bg-glass)",
                    borderRadius: "16px",
                    padding: "2rem",
                    backdropFilter: "blur(10px)",
                    marginBottom: "1.5rem",
                  }}
                >
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      color: "var(--text-primary)",
                      marginBottom: "1.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <ClipboardList size={20} />
                      Ajustes Calculados
                    </div>
                  </h2>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    {proposal.positions.map((pos, idx) => (
                      <div
                        key={idx}
                        style={{
                          background:
                            pos.action === "BUY"
                              ? "rgba(74, 222, 128, 0.1)"
                              : pos.action === "SELL"
                              ? "rgba(248, 113, 113, 0.1)"
                              : "var(--hover-bg)",
                          border:
                            pos.action === "BUY"
                              ? "1px solid rgba(74, 222, 128, 0.3)"
                              : pos.action === "SELL"
                              ? "1px solid rgba(248, 113, 113, 0.3)"
                              : "1px solid var(--border)",
                          borderRadius: "12px",
                          padding: "1.25rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontWeight: "600",
                                color: "var(--text-primary)",
                                fontSize: "1.1rem",
                              }}
                            >
                              {pos.assetName}{" "}
                              <span
                                style={{
                                  color: "var(--text-on-glass-muted)",
                                  fontWeight: "400",
                                }}
                              >
                                ({pos.assetSymbol})
                              </span>
                            </div>
                            <div
                              style={{
                                color: "var(--text-on-glass-muted)",
                                fontSize: "0.9rem",
                                marginTop: "0.25rem",
                              }}
                            >
                              Peso:{" "}
                              {formatNumberES(pos.currentWeight * 100, {
                                minimumFractionDigits: 1,
                                maximumFractionDigits: 1,
                              })}
                              % →{" "}
                              {formatNumberES(pos.targetWeight * 100, {
                                maximumFractionDigits: 0,
                              })}
                              %
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: "1.5rem",
                                fontWeight: "700",
                                color:
                                  pos.action === "BUY"
                                    ? "#4ade80"
                                    : pos.action === "SELL"
                                    ? "#f87171"
                                    : "white",
                              }}
                            >
                              {pos.action}
                            </div>
                            {pos.action !== "HOLD" && (
                              <>
                                <div
                                  style={{
                                    fontSize: "1.25rem",
                                    fontWeight: "600",
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {formatQuantity(Math.abs(pos.deltaQuantity), pos.assetSymbol, pos.assetType)}{" "}
                                  <span
                                    style={{
                                      color: "var(--text-on-glass-muted)",
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    {isFractionalAsset(pos.assetSymbol, pos.assetType) ? "unidades" : "acciones"}
                                  </span>
                                </div>
                                {confirmMode ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "0.5rem",
                                      marginTop: "0.25rem",
                                    }}
                                  >
                                    <span style={{ color: "var(--text-on-glass-muted)", fontSize: "0.85rem" }}>@</span>
                                    <div style={{ position: "relative" }}>
                                      <span style={{
                                        position: "absolute",
                                        left: "0.5rem",
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        color: "var(--text-on-glass-muted)",
                                        fontSize: "0.85rem",
                                        pointerEvents: "none",
                                      }}>$</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={executionPrices[pos.assetId] ?? pos.currentPrice}
                                        onChange={(e) => {
                                          const val = parseFloat(e.target.value);
                                          if (!isNaN(val) && val > 0) {
                                            setExecutionPrices((prev) => ({
                                              ...prev,
                                              [pos.assetId]: val,
                                            }));
                                          }
                                        }}
                                        style={{
                                          width: "120px",
                                          padding: "0.375rem 0.5rem 0.375rem 1.25rem",
                                          background: "var(--bg-glass)",
                                          border: executionPrices[pos.assetId] !== pos.currentPrice
                                            ? "1px solid #a78bfa"
                                            : "1px solid var(--border)",
                                          borderRadius: "6px",
                                          color: "var(--text-primary)",
                                          fontSize: "0.85rem",
                                          fontFamily: "inherit",
                                        }}
                                      />
                                    </div>
                                    {executionPrices[pos.assetId] !== undefined &&
                                      executionPrices[pos.assetId] !== pos.currentPrice && (
                                      <span
                                        style={{
                                          color: "var(--text-on-glass-muted)",
                                          fontSize: "0.75rem",
                                          textDecoration: "line-through",
                                          opacity: 0.6,
                                        }}
                                      >
                                        {formatCurrencyES(pos.currentPrice, { maximumFractionDigits: 2 })}
                                      </span>
                                    )}
                                    <span style={{ color: "var(--text-on-glass-muted)", fontSize: "0.85rem" }}>
                                      ≈ {formatCurrencyES(
                                        Math.abs(pos.deltaQuantity) * (executionPrices[pos.assetId] ?? pos.currentPrice)
                                      )}
                                    </span>
                                  </div>
                                ) : (
                                  <div
                                    style={{
                                      color: "var(--text-on-glass-muted)",
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    @{" "}
                                    {formatCurrencyES(pos.currentPrice, {
                                      maximumFractionDigits: 2,
                                    })}{" "}
                                    ≈ {formatCurrencyES(Math.abs(pos.deltaValue))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            marginTop: "1rem",
                            paddingTop: "1rem",
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            justifyContent: "space-between",
                            color: "var(--text-on-glass-muted)",
                            fontSize: "0.85rem",
                          }}
                        >
                          <span>
                            Actual:{" "}
                            {formatQuantity(pos.currentQuantity, pos.assetSymbol, pos.assetType)}{" "}
                            ({formatCurrencyES(pos.currentValue)})
                          </span>
                          <span>→</span>
                          <span>
                            Objetivo:{" "}
                            {formatQuantity(pos.targetQuantity, pos.assetSymbol, pos.assetType)}{" "}
                            ({formatCurrencyES(pos.targetValue)})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Equity/Borrow Breakdown */}
                {(proposal.summary.equityUsedFromContribution > 0 ||
                  proposal.summary.borrowIncrease > 0) && (
                  <div
                    style={{
                      background: "rgba(251, 191, 36, 0.1)",
                      border: "1px solid rgba(251, 191, 36, 0.3)",
                      borderRadius: "12px",
                      padding: "1rem",
                      marginBottom: "1.5rem",
                    }}
                  >
                    {(() => {
                      const items: string[] = [];
                      if (proposal.summary.equityUsedFromContribution > 0)
                        items.push(`${formatCurrencyES(proposal.summary.equityUsedFromContribution)} de equity`);
                      if (proposal.summary.borrowIncrease > 0)
                        items.push(`${formatCurrencyES(proposal.summary.borrowIncrease)} de préstamo`);
                      if (proposal.summary.borrowIncrease < 0)
                        items.push(`Reducción de préstamo: ${formatCurrencyES(Math.abs(proposal.summary.borrowIncrease))}`);
                      return (
                        <div style={{ color: "var(--text-on-glass)", fontSize: "0.9rem", margin: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: items.length > 1 ? "0.5rem" : 0 }}>
                            <DollarSign size={16} />
                            <strong>Desglose de origen:{items.length === 1 ? ` ${items[0]}` : ""}</strong>
                          </div>
                          {items.length > 1 && (
                            <div style={{ paddingLeft: "1.5rem" }}>
                              {items.map((item, i) => (
                                <div key={i} style={{ marginBottom: i < items.length - 1 ? "0.25rem" : 0 }}>
                                  • {item}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Info box */}
                <div
                  style={{
                    background: "rgba(102, 126, 234, 0.1)",
                    border: "1px solid rgba(102, 126, 234, 0.3)",
                    borderRadius: "12px",
                    padding: "1rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <p
                    style={{
                      color: "var(--text-on-glass)",
                      fontSize: "0.9rem",
                      margin: 0,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <Lightbulb size={16} style={{ flexShrink: 0 }} />
                    <span>
                      {confirmMode
                        ? "Revisa y ajusta los precios de ejecución reales de tu broker. Si no hubo slippage, aplica directamente."
                        : "Cuando hayas ejecutado estos ajustes en tu broker, pulsa \"Confirmar Ajustes\" para actualizar composición en Margn."}
                    </span>
                  </p>
                </div>

                {/* Action Buttons */}
                {(() => {
                  const allHold = proposal.positions.every(
                    (pos) => pos.action === "HOLD"
                  );
                  const noBorrowIncrease =
                    Math.abs(proposal.summary.borrowIncrease) < 0.01;
                  const needsRebalance = !(allHold && noBorrowIncrease);

                  return (
                    <div
                      style={{
                        display: "flex",
                        gap: "1rem",
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                      }}
                    >
                      {confirmMode ? (
                        <>
                          <button
                            onClick={handleCancelConfirm}
                            disabled={isSubmitting}
                            style={{
                              padding: "0.875rem 1.5rem",
                              background: "transparent",
                              color: "var(--text-on-glass-muted)",
                              border: "1px solid var(--border)",
                              borderRadius: "6px",
                              fontSize: "0.95rem",
                              fontWeight: "500",
                              cursor: isSubmitting ? "not-allowed" : "pointer",
                              opacity: isSubmitting ? 0.5 : 1,
                            }}
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleConfirm}
                            disabled={isSubmitting}
                            style={{
                              padding: "0.875rem 2rem",
                              background: isSubmitting
                                ? "var(--bg-glass)"
                                : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                              color: isSubmitting
                                ? "var(--text-on-glass-muted)"
                                : "white",
                              border: isSubmitting
                                ? "1px solid var(--border)"
                                : "none",
                              borderRadius: "6px",
                              fontSize: "0.95rem",
                              fontWeight: "600",
                              cursor: isSubmitting ? "not-allowed" : "pointer",
                              opacity: isSubmitting ? 0.5 : 1,
                            }}
                          >
                            {isSubmitting
                              ? "Aplicando..."
                              : hasCustomPrices
                              ? "Aplicar con precios reales"
                              : "Aplicar Ajustes"}
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={handleAccept}
                          disabled={!needsRebalance}
                          style={{
                            padding: "0.875rem 2rem",
                            background: !needsRebalance
                              ? "var(--bg-glass)"
                              : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                            color: !needsRebalance
                              ? "var(--text-on-glass-muted)"
                              : "white",
                            border: !needsRebalance
                              ? "1px solid var(--border)"
                              : "none",
                            borderRadius: "6px",
                            fontSize: "0.95rem",
                            fontWeight: "600",
                            opacity: !needsRebalance ? 0.5 : 1,
                            cursor: !needsRebalance ? "not-allowed" : "pointer",
                          }}
                        >
                          Confirmar Ajustes
                        </button>
                      )}
                    </div>
                  );
                })()}
              </>
            ) : null}

            {message && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "rgba(74, 222, 128, 0.2)",
                  color: "#4ade80",
                  borderRadius: "8px",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                }}
              >
                {message}
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "rgba(248, 113, 113, 0.2)",
                  color: "#f87171",
                  borderRadius: "8px",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
        </FeatureGate>
      </DashboardSidebar>
    </>
  );
}
