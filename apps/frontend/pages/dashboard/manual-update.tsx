import React, {
  useState,
  useEffect,
  FormEvent,
  useRef,
  useCallback,
} from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../lib/auth";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { usePageState } from "../../lib/hooks/use-page-state";
import {
  updatePositions,
  getPortfolioSummary,
  searchSymbols,
  SymbolSearchResult,
} from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import { invalidatePortfolioCache } from "../../lib/hooks/use-portfolio-data";
import { NumberInput } from "../../components/NumberInput";
import {
  formatCurrencyES,
  formatForInput,
  parseNumberES,
} from "../../lib/number-format";
import { Trash2 } from "lucide-react";

interface Asset {
  id: string;
  symbol: string;
  name: string;
}

interface PositionInput {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  quantity: string;
  currentQuantity: number;
  tempId?: string; // Temporary ID for new positions
}

/**
 * Sync Positions page
 * Used to synchronize the actual holdings with what's in the broker
 */
export default function ManualUpdate() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const [equity, setEquity] = useState<number>(0);
  const [positions, setPositions] = useState<PositionInput[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Persist form state across navigation
  const { clear: clearPageState } = usePageState({
    key: 'manual-update',
    portfolioId,
    snapshot: () => ({
      equity,
      positions: positions.map(p => ({
        assetId: p.assetId,
        assetSymbol: p.assetSymbol,
        assetName: p.assetName,
        quantity: p.quantity,
        currentQuantity: p.currentQuantity,
        tempId: p.tempId,
      })),
    }),
    restore: (saved) => {
      if (saved.equity) setEquity(saved.equity);
      if (saved.positions?.length) {
        setPositions(saved.positions);
        setIsLoading(false);
      }
    },
    deps: [equity, positions],
  });

  // Symbol search state
  const [searchResults, setSearchResults] = useState<
    Record<number, SymbolSearchResult[]>
  >({});
  const [showDropdown, setShowDropdown] = useState<Record<number, boolean>>({});
  const [searchAbort, setSearchAbort] = useState<Record<number, AbortController>>({});
  const [highlightedIndex, setHighlightedIndex] = useState<Record<number, number>>({});
  const [searchTimeout, setSearchTimeout] = useState<
    Record<number, NodeJS.Timeout>
  >({});
  const dropdownRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /**
   * Get appropriate decimal places and step for an asset
   * Crypto assets (BTC, ETH) need more precision (8 decimals)
   * Stocks/ETFs need less precision (2-4 decimals)
   */
  const getAssetPrecision = (
    symbol: string
  ): { decimals: number; step: string } => {
    const cryptoAssets = ["BTC", "ETH", "BTC-USD", "ETH-USD"];
    const isCrypto = cryptoAssets.some((c) => symbol.toUpperCase().includes(c));

    if (isCrypto) {
      return { decimals: 8, step: "0.00000001" };
    }
    // For stocks/ETFs, use 4 decimals (allows for fractional shares)
    return { decimals: 4, step: "0.0001" };
  };

  /**
   * Format quantity to appropriate precision (with comma as decimal separator)
   * Removes trailing zeros to show only significant digits
   */
  const formatQuantity = useCallback(
    (quantity: number, symbol: string): string => {
      const { decimals } = getAssetPrecision(symbol);
      // Use formatForInput to get comma as decimal separator
      // formatForInput now removes trailing zeros automatically
      return formatForInput(quantity, decimals);
    },
    []
  );

  // Load portfolio and current positions
  useEffect(() => {
    async function loadPortfolio() {
      if (!user?.email || !portfolioId) return;

      setIsLoading(true);
      setError("");

      try {
        // Get current portfolio state
        const summary = await getPortfolioSummary(portfolioId);

        // Set current equity
        setEquity(summary.metrics.equity);

        // Set positions from current holdings
        // Format quantities to appropriate precision to avoid too many decimals
        const positionInputs: PositionInput[] = summary.positions.map(
          (pos: { asset: Asset; quantity: number }) => {
            const formattedQuantity = formatQuantity(
              pos.quantity,
              pos.asset.symbol
            );

            return {
              assetId: pos.asset.id,
              assetSymbol: pos.asset.symbol,
              assetName: pos.asset.name,
              quantity: formattedQuantity,
              currentQuantity: pos.quantity,
            };
          }
        );

        setPositions(positionInputs);
      } catch (err) {
        console.error("Error loading portfolio:", err);
        setError(
          err instanceof Error ? err.message : "Error al cargar el portfolio"
        );
      } finally {
        setIsLoading(false);
      }
    }

    if (!router.isReady || loading) return;
    if (user) {
      loadPortfolio();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router.isReady, portfolioId, formatQuantity]);

  const handlePositionChange = (index: number, value: number | string) => {
    const updated = [...positions];
    // Convert number to string with comma decimal separator for display
    const quantityStr =
      typeof value === "number"
        ? isNaN(value)
          ? ""
          : formatForInput(
              value,
              getAssetPrecision(updated[index].assetSymbol).decimals
            )
        : value;
    updated[index] = { ...updated[index], quantity: quantityStr };
    setPositions(updated);
  };

  const handleAddNewPosition = () => {
    const newPosition: PositionInput = {
      assetId: "", // Will be created by backend
      assetSymbol: "",
      assetName: "",
      quantity: "0",
      currentQuantity: 0,
      // Add a unique temporary ID for new positions
      tempId: `new-${Date.now()}-${Math.random()}`,
    };
    setPositions([...positions, newPosition]);
  };

  const handleRemovePosition = (index: number) => {
    const updated = positions.filter((_, i) => i !== index);
    setPositions(updated);
  };

  const handlePositionSymbolChange = (index: number, symbol: string) => {
    const updated = [...positions];
    updated[index] = {
      ...updated[index],
      assetSymbol: symbol,
      assetName: symbol, // Will be updated when selected
    };
    setPositions(updated);

    // Clear previous timeout and abort previous request
    if (searchTimeout[index]) {
      clearTimeout(searchTimeout[index]);
    }
    if (searchAbort[index]) {
      searchAbort[index].abort();
    }

    // Debounce search with abort controller
    if (symbol.length >= 2) {
      const abortController = new AbortController();
      setSearchAbort((prev) => ({ ...prev, [index]: abortController }));
      const timeout = setTimeout(async () => {
        try {
          const results = await searchSymbols(symbol);
          if (abortController.signal.aborted) return;
          setSearchResults((prev) => ({ ...prev, [index]: results }));
          setShowDropdown((prev) => ({ ...prev, [index]: true }));
        } catch (error) {
          if (abortController.signal.aborted) return;
          console.error("Error searching symbols:", error);
        }
      }, 300);
      setSearchTimeout((prev) => ({ ...prev, [index]: timeout }));
    } else {
      setSearchResults((prev) => ({ ...prev, [index]: [] }));
      setShowDropdown((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleSelectSymbol = (index: number, result: SymbolSearchResult) => {
    const updated = [...positions];
    updated[index] = {
      ...updated[index],
      assetSymbol: result.symbol,
      assetName: result.name,
    };
    setPositions(updated);
    setShowDropdown((prev) => ({ ...prev, [index]: false }));
    setSearchResults((prev) => ({ ...prev, [index]: [] }));
    setHighlightedIndex((prev) => ({ ...prev, [index]: -1 }));
  };

  const handleSymbolKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const results = searchResults[index] || [];
    const isOpen = showDropdown[index] && results.length > 0;
    if (e.key === 'Tab' || e.key === 'Enter') {
      if (e.key === 'Tab' && !isOpen) return;
      e.preventDefault();
      if (isOpen) {
        const idx = (highlightedIndex[index] ?? -1) >= 0 ? highlightedIndex[index] : 0;
        handleSelectSymbol(index, results[idx]);
      }
      return;
    }
    if (e.key === 'ArrowDown' && isOpen) {
      e.preventDefault();
      setHighlightedIndex((prev) => ({ ...prev, [index]: ((prev[index] ?? -1) + 1) % results.length }));
      return;
    }
    if (e.key === 'ArrowUp' && isOpen) {
      e.preventDefault();
      setHighlightedIndex((prev) => ({ ...prev, [index]: (prev[index] ?? -1) <= 0 ? results.length - 1 : (prev[index] ?? 0) - 1 }));
      return;
    }
    if (e.key === 'Escape') {
      setShowDropdown((prev) => ({ ...prev, [index]: false }));
      setHighlightedIndex((prev) => ({ ...prev, [index]: -1 }));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!portfolioId) {
      setError("No se ha seleccionado un portfolio");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      // Build positions array with current quantities
      // Round quantities to appropriate precision before sending
      console.log("[ManualUpdate] Starting submit, positions:", positions);

      const validPositions = positions
        .filter((p) => {
          // Keep all positions that have a symbol (including those marked for deletion with quantity 0)
          const hasSymbol = !!p.assetSymbol;
          if (!hasSymbol) {
            console.log(
              "[ManualUpdate] Filtering out position without symbol:",
              p
            );
          }
          return hasSymbol;
        })
        .map((p) => {
          const { decimals } = getAssetPrecision(p.assetSymbol);
          const quantity = parseNumberES(p.quantity);
          // Round to appropriate precision to avoid precision issues
          const roundedQuantity = isNaN(quantity)
            ? 0
            : Number(quantity.toFixed(decimals));

          const positionData = {
            symbol: p.assetSymbol,
            quantity: roundedQuantity,
            avgPrice: 0, // Will be fetched from latest prices
            source: "manual", // Required by backend DTO
          };

          console.log(
            `[ManualUpdate] Preparing position: ${
              p.assetSymbol
            }, quantity: ${roundedQuantity}, isNew: ${!p.assetId}`
          );
          return positionData;
        });

      console.log("[ManualUpdate] Valid positions to send:", validPositions);
      console.log(
        "[ManualUpdate] New assets count:",
        positions.filter((p) => !p.assetId && p.assetSymbol).length
      );

      if (validPositions.length === 0) {
        throw new Error("Por favor, introduce al menos una posición");
      }

      // Include equity if provided
      const updateData: any = {
        portfolioId,
        positions: validPositions,
      };

      // Add equity if user provided a value
      if (equity && !isNaN(equity) && equity > 0) {
        updateData.equity = equity;
      }

      console.log("[ManualUpdate] Sending update request:", {
        portfolioId,
        positionsCount: validPositions.length,
        hasEquity: !!updateData.equity,
        newAssets: validPositions.filter(
          (p) =>
            !positions.find(
              (pos) => pos.assetSymbol === p.symbol && pos.assetId
            )
        ).length,
      });

      const response = await updatePositions(updateData);
      console.log("[ManualUpdate] Update response received:", response);

      // Invalidate cache so dashboard shows updated data
      invalidatePortfolioCache(portfolioId, user?.email);
      clearPageState();

      const newAssetsCount = positions.filter(
        (p) => !p.assetId && p.assetSymbol
      ).length;
      if (newAssetsCount > 0) {
        setMessage(
          `✅ ${newAssetsCount} activo(s) añadido(s) correctamente. Los tickers fueron validados y el histórico descargado. Puedes asignar los pesos objetivo en Configuración.`
        );
      } else {
        setMessage("✅ ¡Portfolio actualizado correctamente!");
      }

      setTimeout(
        () => {
          setMessage("");
          router.push(`/dashboard?portfolioId=${portfolioId}`);
        },
        newAssetsCount > 0 ? 4000 : 2000
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al actualizar el portfolio"
      );
    } finally {
      setIsSubmitting(false);
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
          <p style={{ color: "var(--text-primary)", fontSize: "1.2rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Sincronizar Posiciones - Margn</title>
      </Head>
      <DashboardSidebar>
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
                Sincronizar Posiciones
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Actualiza las cantidades reales que tienes en tu broker para que
                coincidan con la app.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Equity */}
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
                    marginBottom: "1rem",
                  }}
                >
                  Equity Actual
                </h2>
                <NumberInput
                  value={equity}
                  onChange={(val) => setEquity(isNaN(val) ? 0 : val)}
                  min={0}
                  step={0.01}
                  decimals={2}
                  placeholder="p.e. 72500"
                  disabled={isSubmitting}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "var(--bg-glass)",
                    color: "var(--text-primary)",
                    border: "2px solid var(--input-border)",
                    borderRadius: "8px",
                    fontSize: "1.25rem",
                    boxSizing: "border-box",
                  }}
                />
                <p
                  style={{
                    color: "var(--text-on-glass-muted)",
                    fontSize: "0.875rem",
                    marginTop: "0.5rem",
                  }}
                >
                  Tu equity actual en USD (valor total menos cantidad prestada)
                </p>
              </div>

              {/* Positions */}
              <div
                style={{
                  background: "var(--bg-glass)",
                  borderRadius: "16px",
                  padding: "2rem",
                  backdropFilter: "blur(10px)",
                  marginBottom: "1.5rem",
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
                      fontSize: "1.25rem",
                      fontWeight: "bold",
                      color: "var(--text-primary)",
                      margin: 0,
                    }}
                  >
                    Posiciones Actuales
                  </h2>
                  <button
                    type="button"
                    onClick={handleAddNewPosition}
                    disabled={isSubmitting}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "rgba(59, 130, 246, 0.2)",
                      color: "#3b82f6",
                      border: "1px solid rgba(59, 130, 246, 0.4)",
                      borderRadius: "6px",
                      fontSize: "0.875rem",
                      cursor: isSubmitting ? "not-allowed" : "pointer",
                      opacity: isSubmitting ? 0.5 : 1,
                    }}
                  >
                    + Añadir Activo
                  </button>
                </div>

                {positions.length === 0 ? (
                  <p style={{ color: "var(--text-on-glass-muted)" }}>
                    No hay posiciones. Haz clic en "Añadir Activo" para
                    comenzar.
                  </p>
                ) : (
                  // Sort positions: new assets (without assetId) first, then existing ones
                  // Create a map to find original index for each position
                  (() => {
                    const sortedPositions = [...positions].sort((a, b) => {
                      // New assets (no assetId) come first
                      if (!a.assetId && b.assetId) return -1;
                      if (a.assetId && !b.assetId) return 1;
                      return 0;
                    });

                    return sortedPositions.map((pos, sortedIdx) => {
                      // Find the original index in the positions array
                      const originalIdx = positions.findIndex((p) => {
                        if (pos.assetId) {
                          // For existing assets, match by assetId
                          return p.assetId === pos.assetId;
                        } else {
                          // For new assets, match by tempId or by reference
                          return (
                            (p.tempId &&
                              pos.tempId &&
                              p.tempId === pos.tempId) ||
                            p === pos
                          );
                        }
                      });

                      return (
                        <div
                          key={pos.assetId || `new-${originalIdx}`}
                          style={{
                            marginBottom:
                              sortedIdx < sortedPositions.length - 1
                                ? "1.5rem"
                                : "0",
                            paddingBottom:
                              sortedIdx < sortedPositions.length - 1
                                ? "1.5rem"
                                : "0",
                            borderBottom:
                              sortedIdx < sortedPositions.length - 1
                                ? "1px solid var(--border)"
                                : "none",
                          }}
                        >
                          <label
                            style={{
                              display: "block",
                              fontWeight: "500",
                              color: "var(--text-on-glass)",
                              marginBottom: "0.5rem",
                            }}
                          >
                            {pos.assetId
                              ? `${pos.assetName} (${pos.assetSymbol})`
                              : "Nuevo Activo"}
                          </label>

                          {!pos.assetId && (
                            <div
                              style={{
                                position: "relative",
                                marginBottom: "0.75rem",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.5rem",
                                  alignItems: "flex-start",
                                }}
                              >
                                <input
                                  type="text"
                                  value={pos.assetSymbol}
                                  onChange={(e) =>
                                    handlePositionSymbolChange(
                                      originalIdx,
                                      e.target.value
                                    )
                                  }
                                  onKeyDown={(e) => handleSymbolKeyDown(originalIdx, e)}
                                  onFocus={() => {
                                    if (searchResults[originalIdx]?.length > 0) {
                                      setShowDropdown((prev) => ({
                                        ...prev,
                                        [originalIdx]: true,
                                      }));
                                    }
                                  }}
                                  onBlur={() => {
                                    // Delay to allow click on dropdown item
                                    setTimeout(() => {
                                      setShowDropdown((prev) => ({
                                        ...prev,
                                        [originalIdx]: false,
                                      }));
                                    }, 200);
                                  }}
                                  placeholder="Buscar símbolo (ej: BTC-USD, SPY, GLD)"
                                  disabled={isSubmitting}
                                  style={{
                                    flex: 1,
                                    padding: "0.75rem 1rem",
                                    background: "var(--bg-glass)",
                                    color: "var(--text-primary)",
                                    border: "2px solid rgba(59, 130, 246, 0.4)",
                                    borderRadius: "8px",
                                    fontSize: "1rem",
                                    boxSizing: "border-box",
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePosition(originalIdx)}
                                  disabled={isSubmitting}
                                  style={{
                                    padding: "0.75rem",
                                    background: "rgba(239, 68, 68, 0.2)",
                                    color: "#ef4444",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    borderRadius: "8px",
                                    cursor: isSubmitting
                                      ? "not-allowed"
                                      : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    opacity: isSubmitting ? 0.5 : 1,
                                    transition: "all 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSubmitting) {
                                      e.currentTarget.style.background =
                                        "rgba(239, 68, 68, 0.3)";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      "rgba(239, 68, 68, 0.2)";
                                  }}
                                  title="Eliminar posición"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                              {showDropdown[originalIdx] &&
                                searchResults[originalIdx] &&
                                searchResults[originalIdx].length > 0 && (
                                  <div
                                    ref={(el) => {
                                      dropdownRefs.current[originalIdx] = el;
                                    }}
                                    style={{
                                      position: "absolute",
                                      top: "100%",
                                      left: 0,
                                      right: 0,
                                      background: "var(--border)",
                                      border: "1px solid var(--input-border)",
                                      borderRadius: "8px",
                                      marginTop: "0.25rem",
                                      maxHeight: "300px",
                                      overflowY: "auto",
                                      zIndex: 1000,
                                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                                    }}
                                  >
                                    {searchResults[originalIdx].map(
                                      (result, resultIdx) => (
                                        <div
                                          key={`${result.symbol}-${resultIdx}`}
                                          onClick={() =>
                                            handleSelectSymbol(
                                              originalIdx,
                                              result
                                            )
                                          }
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          } // Prevent blur
                                          onMouseEnter={() =>
                                            setHighlightedIndex((prev) => ({ ...prev, [originalIdx]: resultIdx }))
                                          }
                                          style={{
                                            padding: "0.75rem 1rem",
                                            cursor: "pointer",
                                            borderBottom:
                                              resultIdx <
                                              searchResults[originalIdx]
                                                .length -
                                                1
                                                ? "1px solid var(--input-border)"
                                                : "none",
                                            background: resultIdx === (highlightedIndex[originalIdx] ?? -1) ? "rgba(59, 130, 246, 0.2)" : "transparent",
                                            transition: "background 0.15s",
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
                                                  color: "var(--text-primary)",
                                                  fontWeight: "600",
                                                  fontSize: "0.95rem",
                                                }}
                                              >
                                                {result.symbol}
                                              </div>
                                              <div
                                                style={{
                                                  color: "var(--text-muted)",
                                                  fontSize: "0.8125rem",
                                                  marginTop: "0.125rem",
                                                }}
                                              >
                                                {result.name}
                                              </div>
                                              {result.exchange && (
                                                <div
                                                  style={{
                                                    color: "var(--text-dim)",
                                                    fontSize: "0.75rem",
                                                    marginTop: "0.125rem",
                                                  }}
                                                >
                                                  {result.exchange}
                                                </div>
                                              )}
                                            </div>
                                            {result.price !== null && (
                                              <div
                                                style={{
                                                  color: "#22c55e",
                                                  fontWeight: "600",
                                                  fontSize: "0.95rem",
                                                }}
                                              >
                                                {formatCurrencyES(
                                                  result.price,
                                                  {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                  }
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      )
                                    )}
                                  </div>
                                )}
                            </div>
                          )}

                          {/* Only show quantity input for existing assets */}
                          {pos.assetId && (
                            <>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "0.5rem",
                                  alignItems: "flex-start",
                                  marginBottom: "0.75rem",
                                }}
                              >
                                <NumberInput
                                  step={
                                    pos.assetSymbol
                                      ? parseFloat(
                                          getAssetPrecision(pos.assetSymbol).step
                                        )
                                      : 0.0001
                                  }
                                  min={0}
                                  value={parseNumberES(pos.quantity) || 0}
                                  onChange={(val) =>
                                    handlePositionChange(originalIdx, val)
                                  }
                                  decimals={
                                    pos.assetSymbol
                                      ? getAssetPrecision(pos.assetSymbol)
                                          .decimals
                                      : 4
                                  }
                                  placeholder="Cantidad"
                                  disabled={isSubmitting}
                                  style={{
                                    flex: 1,
                                    padding: "0.75rem 1rem",
                                    background: "var(--bg-glass)",
                                    color: "var(--text-primary)",
                                    border: "2px solid var(--input-border)",
                                    borderRadius: "8px",
                                    fontSize: "1rem",
                                    boxSizing: "border-box",
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePosition(originalIdx)}
                                  disabled={isSubmitting}
                                  style={{
                                    padding: "0.75rem",
                                    background: "rgba(239, 68, 68, 0.2)",
                                    color: "#ef4444",
                                    border: "1px solid rgba(239, 68, 68, 0.4)",
                                    borderRadius: "8px",
                                    cursor: isSubmitting
                                      ? "not-allowed"
                                      : "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                    opacity: isSubmitting ? 0.5 : 1,
                                    transition: "all 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSubmitting) {
                                      e.currentTarget.style.background =
                                        "rgba(239, 68, 68, 0.3)";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                      "rgba(239, 68, 68, 0.2)";
                                  }}
                                  title="Eliminar posición"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </>
                          )}

                          {/* Info message for new assets */}
                          {!pos.assetId && pos.assetSymbol && (
                            <div
                              style={{
                                padding: "0.75rem 1rem",
                                background: "rgba(59, 130, 246, 0.1)",
                                border: "1px solid rgba(59, 130, 246, 0.3)",
                                borderRadius: "8px",
                                marginTop: "0.5rem",
                              }}
                            >
                              <p
                                style={{
                                  color: "var(--text-on-glass)",
                                  fontSize: "0.875rem",
                                  margin: 0,
                                }}
                              >
                                ℹ️ El sistema validará el ticker y descargará el
                                histórico de precios automáticamente. Puedes
                                asignar el peso objetivo en la página de
                                Configuración.
                              </p>
                            </div>
                          )}
                          {pos.currentQuantity > 0 && (
                            <p
                              style={{
                                color: "var(--text-dim)",
                                fontSize: "0.8rem",
                                marginTop: "0.25rem",
                              }}
                            >
                              Actual:{" "}
                              {formatQuantity(
                                pos.currentQuantity,
                                pos.assetSymbol
                              )}
                            </p>
                          )}
                        </div>
                      );
                    });
                  })()
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="submit"
                  disabled={isSubmitting || !portfolioId}
                  style={{
                    padding: "0.875rem 2rem",
                    background:
                      isSubmitting || !portfolioId
                        ? "var(--disabled-bg)"
                        : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: isSubmitting || !portfolioId ? "var(--disabled-color)" : "white",
                    border: isSubmitting || !portfolioId ? "1px solid var(--disabled-border)" : "none",
                    borderRadius: "6px",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                    opacity: isSubmitting || !portfolioId ? 0.5 : 1,
                    cursor:
                      isSubmitting || !portfolioId ? "not-allowed" : "pointer",
                  }}
                >
                  {isSubmitting ? "Guardando..." : "Guardar Estado Actual"}
                </button>
              </div>
            </form>

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
      </DashboardSidebar>
    </>
  );
}
