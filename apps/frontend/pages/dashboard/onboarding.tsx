import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../contexts/AuthContext";
import {
  searchSymbols,
  createPortfolio,
  OnboardingAsset,
  CreatePortfolioRequest,
  SymbolSearchResult,
} from "../../lib/api";
import {
  usePortfolios,
  invalidatePortfolioCache,
} from "../../lib/hooks/use-portfolio-data";
import {
  Rocket,
  TrendingUp,
  BarChart,
  DollarSign,
  Scale,
  Edit,
} from "lucide-react";
import { NumberInput } from "../../components/NumberInput";
import {
  formatCurrencyES,
  formatPercentES,
  formatNumberES,
} from "../../lib/number-format";

/**
 * Onboarding page - wizard for creating first portfolio
 */
export default function Onboarding() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { portfolios, isLoading: portfoliosLoading } = usePortfolios();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  // Step 1: Basic info
  const [portfolioName, setPortfolioName] = useState("Mi Portfolio Apalancado");
  const [initialCapital, setInitialCapital] = useState<number>(10000);

  // Step 2: Assets
  const [assets, setAssets] = useState<OnboardingAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement | null>(null);

  // Step 3: Weights
  const [weightMethod, setWeightMethod] = useState<
    "sharpe" | "manual" | "equal"
  >("sharpe");
  const [manualWeights, setManualWeights] = useState<Record<string, number>>(
    {}
  );

  // Step 4: Config (optional)
  const [leverageMin, setLeverageMin] = useState(2.5);
  const [leverageMax, setLeverageMax] = useState(4.0);
  const [leverageTarget, setLeverageTarget] = useState(3.0);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1000);
  const [contributionFrequency, setContributionFrequency] = useState<
    "weekly" | "biweekly" | "monthly" | "quarterly"
  >("monthly");
  const [contributionDayOfMonth, setContributionDayOfMonth] = useState(1);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [creationProgress, setCreationProgress] = useState("");

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  // Redirect to dashboard if user already has portfolios (completed onboarding)
  useEffect(() => {
    if (!loading && !portfoliosLoading && user && portfolios.length > 0) {
      router.push("/dashboard");
    }
  }, [user, loading, portfoliosLoading, portfolios.length, router]);

  // Initialize equal weights when assets change
  useEffect(() => {
    if (assets.length > 0) {
      const equalWeight = 1 / assets.length;
      const newWeights: Record<string, number> = {};
      for (const asset of assets) {
        newWeights[asset.symbol] = manualWeights[asset.symbol] ?? equalWeight;
      }
      setManualWeights(newWeights);
    }
  }, [assets.length]);

  // Debounced search
  useEffect(() => {
    // Don't search if user is not authenticated or query is too short
    if (!user || searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    // Verify token is available
    const token = localStorage.getItem("supabase_token");
    if (!token) {
      console.warn("[Onboarding] No token available, waiting for auth...");
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSymbols(searchQuery);
        // Filter out already added assets
        const filtered = results.filter(
          (r) => !assets.some((a) => a.symbol === r.symbol)
        );
        setSearchResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch (err) {
        console.error("Search error:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Handle authentication errors
        if (
          errorMessage.includes("Unauthorized") ||
          errorMessage.includes("Invalid token") ||
          errorMessage.includes("401")
        ) {
          console.error("[Onboarding] Authentication error during search");
          // Try to refresh token from Supabase session
          const { supabase } = await import("../../lib/supabase");
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            localStorage.setItem("supabase_token", session.access_token);
            console.log("[Onboarding] Token refreshed, retrying search...");
            // Retry search after token refresh
            try {
              const retryResults = await searchSymbols(searchQuery);
              const filtered = retryResults.filter(
                (r) => !assets.some((a) => a.symbol === r.symbol)
              );
              setSearchResults(filtered);
              setShowDropdown(filtered.length > 0);
            } catch (retryErr) {
              console.error("[Onboarding] Retry failed:", retryErr);
              setSearchResults([]);
              setShowDropdown(false);
            }
          } else {
            setSearchResults([]);
            setShowDropdown(false);
          }
        } else {
          setSearchResults([]);
          setShowDropdown(false);
        }
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, assets, user]);

  // Add asset
  const handleAddAsset = useCallback((result: SymbolSearchResult) => {
    setAssets((prev) => [
      ...prev,
      {
        symbol: result.symbol,
        name: result.name,
        assetType: "unknown",
        price: result.price,
      },
    ]);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  }, []);

  // Remove asset
  const handleRemoveAsset = useCallback((symbol: string) => {
    setAssets((prev) => prev.filter((a) => a.symbol !== symbol));
    setManualWeights((prev) => {
      const newWeights = { ...prev };
      delete newWeights[symbol];
      return newWeights;
    });
  }, []);

  // Update manual weight
  const handleWeightChange = useCallback((symbol: string, weight: number) => {
    setManualWeights((prev) => ({
      ...prev,
      [symbol]: weight,
    }));
  }, []);

  // Normalize weights to sum to 1
  const normalizeWeights = useCallback(() => {
    const total = Object.values(manualWeights).reduce((a, b) => a + b, 0);
    if (total > 0 && Math.abs(total - 1) > 0.01) {
      const newWeights: Record<string, number> = {};
      for (const [symbol, weight] of Object.entries(manualWeights)) {
        newWeights[symbol] = weight / total;
      }
      setManualWeights(newWeights);
    }
  }, [manualWeights]);

  // Calculate total weight
  const totalWeight = Object.values(manualWeights).reduce((a, b) => a + b, 0);
  const weightsValid = Math.abs(totalWeight - 1) <= 0.01;

  // Submit portfolio with SSE progress
  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError("");
    setCreationProgress("Iniciando creación del portfolio...");

    try {
      const request: CreatePortfolioRequest = {
        name: portfolioName,
        initialCapital,
        baseCurrency: "USD",
        assets: assets.map((a) => ({
          symbol: a.symbol,
          name: a.name,
          assetType: a.assetType,
        })),
        weightAllocationMethod: weightMethod,
        targetWeights: weightMethod === "manual" ? manualWeights : undefined,
        leverageMin,
        leverageMax,
        leverageTarget,
        monthlyContribution,
        contributionFrequency,
        contributionDayOfMonth,
        contributionEnabled: true,
      };

      // Use fetch with ReadableStream for SSE (EventSource doesn't support POST)
      const token = localStorage.getItem("supabase_token");
      const API_BASE_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003/api";

      const response = await fetch(`${API_BASE_URL}/portfolios`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));

              if (data.type === "connected") {
                setCreationProgress(data.message || "Conectado...");
              } else if (data.type === "step") {
                setCreationProgress(data.message || `Paso: ${data.step}`);
              } else if (data.type === "asset") {
                // Use message directly if provided, otherwise construct it
                if (data.message) {
                  setCreationProgress(data.message);
                } else if (data.current && data.total) {
                  setCreationProgress(
                    `Descargando ${data.asset}... (${data.current}/${data.total})`
                  );
                } else {
                  setCreationProgress(`Procesando ${data.asset}...`);
                }
              } else if (data.type === "complete") {
                finalResult = data.result;
                setCreationProgress("¡Portfolio creado exitosamente!");
              } else if (data.type === "error") {
                throw new Error(data.message || "Error desconocido");
              }
            } catch (parseError) {
              console.error("Error parsing SSE data:", parseError, line);
            }
          }
        }
      }

      // Show warnings if any
      if (finalResult?.warnings && finalResult.warnings.length > 0) {
        console.warn("Portfolio created with warnings:", finalResult.warnings);
      }

      // Invalidate portfolio cache to ensure dashboard sees the new portfolio
      if (user?.email) {
        invalidatePortfolioCache(
          finalResult?.portfolio?.id || null,
          user.email
        );
        // Wait a bit for cache to refresh before redirecting
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Redirect to dashboard
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear portfolio");
      setIsSubmitting(false);
      setCreationProgress("");
    }
  };

  // Navigation
  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return portfolioName.trim() !== "" && initialCapital > 0;
      case 2:
        return assets.length >= 1;
      case 3:
        return weightMethod !== "manual" || weightsValid;
      case 4:
        return true; // Optional step
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < totalSteps && canGoNext()) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  if (loading || portfoliosLoading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Don't render if user already has portfolios (will redirect)
  if (portfolios.length > 0) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "var(--text-muted)" }}>Redirigiendo al dashboard...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Configurar Portfolio - Leveraged DCA App</title>
      </Head>
      <div style={containerStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1
              style={{
                ...titleStyle,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <Rocket size={28} />
              Configura tu Portfolio
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
              Vamos a configurar tu portfolio de inversión apalancada
            </p>
          </div>

          {/* Progress Bar */}
          <div style={progressContainerStyle}>
            {[1, 2, 3, 4, 5].map((step) => (
              <React.Fragment key={step}>
                <div
                  style={{
                    ...progressDotStyle,
                    background: step <= currentStep ? "#3b82f6" : "var(--input-border)",
                  }}
                >
                  {step}
                </div>
                {step < 5 && (
                  <div
                    style={{
                      ...progressLineStyle,
                      background: step < currentStep ? "#3b82f6" : "var(--input-border)",
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>

          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-dim)",
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            {
              ["Básico", "Activos", "Pesos", "Configuración", "Resumen"][
                currentStep - 1
              ]
            }
          </div>

          {/* Step Content */}
          <div style={stepContentStyle}>
            {/* Step 1: Basic Info */}
            {currentStep === 1 && (
              <div>
                <h2 style={stepTitleStyle}>Información Básica</h2>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Nombre del Portfolio</label>
                  <input
                    type="text"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    style={inputStyle}
                    placeholder="Mi Portfolio Apalancado"
                  />
                </div>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Capital Inicial (USD)</label>
                  <NumberInput
                    value={initialCapital}
                    onChange={(val) => setInitialCapital(isNaN(val) ? 0 : val)}
                    min={0}
                    decimals={0}
                    placeholder="10000"
                    style={inputStyle}
                  />
                  <p style={helpStyle}>
                    El capital inicial representa tu equity disponible para
                    invertir.
                  </p>
                </div>
              </div>
            )}

            {/* Step 2: Assets */}
            {currentStep === 2 && (
              <div>
                <h2 style={stepTitleStyle}>Selecciona tus Activos</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Busca y añade los activos que quieres incluir en tu portfolio.
                </p>

                {/* Search Input */}
                <div style={{ position: "relative", marginBottom: "1.5rem" }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => {
                      if (searchResults.length > 0) {
                        setShowDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay to allow click on dropdown item
                      setTimeout(() => {
                        setShowDropdown(false);
                      }, 200);
                    }}
                    style={inputStyle}
                    placeholder="Buscar ticker (ej: SPY, AAPL, BTC-USD, GLD)"
                  />
                  {isSearching && (
                    <span
                      style={{
                        position: "absolute",
                        right: "12px",
                        top: "12px",
                        color: "var(--text-dim)",
                      }}
                    >
                      Buscando...
                    </span>
                  )}

                  {/* Search Results Dropdown */}
                  {showDropdown && searchResults.length > 0 && (
                    <div
                      ref={dropdownRef}
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
                      {searchResults.map((result, resultIdx) => (
                        <div
                          key={`${result.symbol}-${resultIdx}`}
                          onClick={() => handleAddAsset(result)}
                          onMouseDown={(e) => e.preventDefault()} // Prevent blur
                          style={{
                            padding: "0.75rem 1rem",
                            cursor: "pointer",
                            borderBottom:
                              resultIdx < searchResults.length - 1
                                ? "1px solid var(--input-border)"
                                : "none",
                            background: "transparent",
                            transition: "background 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background =
                              "rgba(59, 130, 246, 0.2)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = "transparent";
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
                                  fontSize: "0.875rem",
                                  marginTop: "0.25rem",
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
                                {formatCurrencyES(result.price, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Assets */}
                <div style={{ marginBottom: "1rem" }}>
                  <label style={labelStyle}>
                    Activos Seleccionados ({assets.length})
                  </label>
                  {assets.length === 0 ? (
                    <p
                      style={{
                        color: "var(--text-dim)",
                        fontStyle: "italic",
                        padding: "1rem",
                      }}
                    >
                      Busca y añade al menos un activo para continuar.
                    </p>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      {assets.map((asset) => (
                        <div key={asset.symbol} style={assetItemStyle}>
                          <div>
                            <span
                              style={{ fontWeight: "600", color: "var(--text-primary)" }}
                            >
                              {asset.symbol}
                            </span>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                marginLeft: "0.5rem",
                                fontSize: "0.85rem",
                              }}
                            >
                              {asset.name}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.75rem",
                            }}
                          >
                            {asset.price && (
                              <span
                                style={{ color: "#22c55e", fontSize: "0.9rem" }}
                              >
                                {formatCurrencyES(asset.price, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </span>
                            )}
                            <button
                              onClick={() => handleRemoveAsset(asset.symbol)}
                              style={removeButtonStyle}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Weights */}
            {currentStep === 3 && (
              <div>
                <h2 style={stepTitleStyle}>Asignación de Pesos</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Elige cómo quieres distribuir tu inversión entre los activos.
                </p>

                {/* Weight Method Selector */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                    marginBottom: "1.5rem",
                  }}
                >
                  <label
                    style={{
                      ...methodOptionStyle,
                      borderColor:
                        weightMethod === "sharpe" ? "#3b82f6" : "var(--input-border)",
                      background:
                        weightMethod === "sharpe"
                          ? "rgba(59, 130, 246, 0.1)"
                          : "transparent",
                    }}
                    onClick={() => setWeightMethod("sharpe")}
                  >
                    <input
                      type="radio"
                      checked={weightMethod === "sharpe"}
                      onChange={() => setWeightMethod("sharpe")}
                      style={{ accentColor: "#3b82f6" }}
                    />
                    <div style={{ marginLeft: "0.75rem" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                        }}
                      >
                        <TrendingUp size={16} />
                        Optimización Sharpe
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Los pesos se calculan automáticamente para maximizar el
                        retorno ajustado al riesgo
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      ...methodOptionStyle,
                      borderColor:
                        weightMethod === "equal" ? "#3b82f6" : "var(--input-border)",
                      background:
                        weightMethod === "equal"
                          ? "rgba(59, 130, 246, 0.1)"
                          : "transparent",
                    }}
                    onClick={() => setWeightMethod("equal")}
                  >
                    <input
                      type="radio"
                      checked={weightMethod === "equal"}
                      onChange={() => setWeightMethod("equal")}
                      style={{ accentColor: "#3b82f6" }}
                    />
                    <div style={{ marginLeft: "0.75rem" }}>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Scale size={16} />
                          Pesos Iguales
                        </div>
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Cada activo tendrá el mismo peso (
                        {formatNumberES(100 / assets.length, {
                          minimumFractionDigits: 1,
                          maximumFractionDigits: 1,
                        })}
                        % cada uno)
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      ...methodOptionStyle,
                      borderColor:
                        weightMethod === "manual" ? "#3b82f6" : "var(--input-border)",
                      background:
                        weightMethod === "manual"
                          ? "rgba(59, 130, 246, 0.1)"
                          : "transparent",
                    }}
                    onClick={() => setWeightMethod("manual")}
                  >
                    <input
                      type="radio"
                      checked={weightMethod === "manual"}
                      onChange={() => setWeightMethod("manual")}
                      style={{ accentColor: "#3b82f6" }}
                    />
                    <div style={{ marginLeft: "0.75rem" }}>
                      <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Edit size={16} />
                          Asignación Manual
                        </div>
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.8rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Define manualmente el peso de cada activo
                      </div>
                    </div>
                  </label>
                </div>

                {/* Manual Weight Sliders */}
                {weightMethod === "manual" && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      {assets.map((asset) => (
                        <div key={asset.symbol} style={weightSliderStyle}>
                          <span
                            style={{
                              minWidth: "100px",
                              fontWeight: "600",
                              color: "var(--text-primary)",
                            }}
                          >
                            {asset.symbol}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={(manualWeights[asset.symbol] || 0) * 100}
                            onChange={(e) =>
                              handleWeightChange(
                                asset.symbol,
                                parseFloat(e.target.value) / 100
                              )
                            }
                            style={{ flex: 1, accentColor: "#3b82f6" }}
                          />
                          <NumberInput
                            min={0}
                            max={100}
                            value={(manualWeights[asset.symbol] || 0) * 100}
                            onChange={(val) =>
                              handleWeightChange(
                                asset.symbol,
                                isNaN(val) ? 0 : val / 100
                              )
                            }
                            decimals={0}
                            style={{
                              ...inputStyle,
                              width: "70px",
                              textAlign: "right",
                            }}
                          />
                          <span style={{ color: "var(--text-muted)" }}>%</span>
                        </div>
                      ))}
                    </div>

                    {/* Total and Normalize */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.75rem 1rem",
                        marginTop: "1rem",
                        background: weightsValid
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(239, 68, 68, 0.1)",
                        borderRadius: "8px",
                        border: `1px solid ${
                          weightsValid
                            ? "rgba(34, 197, 94, 0.3)"
                            : "rgba(239, 68, 68, 0.3)"
                        }`,
                      }}
                    >
                      <span
                        style={{
                          color: weightsValid ? "#22c55e" : "#ef4444",
                          fontWeight: "600",
                        }}
                      >
                        Total: {(totalWeight * 100).toFixed(1)}%
                      </span>
                      {!weightsValid && (
                        <button
                          onClick={normalizeWeights}
                          style={{
                            padding: "0.5rem 1rem",
                            background: "#3b82f6",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                            cursor: "pointer",
                          }}
                        >
                          Normalizar a 100%
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Preview for non-manual */}
                {weightMethod !== "manual" && (
                  <div
                    style={{
                      background: "rgba(59, 130, 246, 0.1)",
                      padding: "1rem",
                      borderRadius: "8px",
                    }}
                  >
                    <p
                      style={{
                        color: "var(--text-muted)",
                        margin: 0,
                        fontSize: "0.9rem",
                      }}
                    >
                      {weightMethod === "sharpe"
                        ? "Los pesos se calcularán automáticamente basándose en el histórico de precios cuando realices un rebalance."
                        : `Cada activo tendrá un peso igual de ${
                            100 / assets.length
                          }%.`}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Configuration */}
            {currentStep === 4 && (
              <div>
                <h2 style={stepTitleStyle}>Configuración Adicional</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Estos valores tienen defaults recomendados. Puedes ajustarlos
                  después.
                </p>

                {/* Leverage */}
                <div style={sectionStyle}>
                  <h3
                    style={{
                      ...sectionTitleStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <BarChart size={18} />
                    Rango de Leverage
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Mínimo</label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <NumberInput
                          value={leverageMin}
                          onChange={(val) =>
                            setLeverageMin(isNaN(val) ? 1 : val)
                          }
                          min={1}
                          max={10}
                          step={0.1}
                          decimals={1}
                          style={inputStyle}
                        />
                        <span style={{ color: "var(--text-muted)" }}>x</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Máximo</label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <NumberInput
                          value={leverageMax}
                          onChange={(val) =>
                            setLeverageMax(isNaN(val) ? 1 : val)
                          }
                          min={1}
                          max={10}
                          step={0.1}
                          decimals={1}
                          style={inputStyle}
                        />
                        <span style={{ color: "var(--text-muted)" }}>x</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Objetivo</label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                        }}
                      >
                        <NumberInput
                          value={leverageTarget}
                          onChange={(val) =>
                            setLeverageTarget(isNaN(val) ? 1 : val)
                          }
                          min={1}
                          max={10}
                          step={0.1}
                          decimals={1}
                          style={inputStyle}
                        />
                        <span style={{ color: "var(--text-muted)" }}>x</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Contributions */}
                <div style={sectionStyle}>
                  <h3
                    style={{
                      ...sectionTitleStyle,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <DollarSign size={18} />
                    Aportaciones Periódicas
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "1rem",
                    }}
                  >
                    <div>
                      <label style={labelStyle}>Monto (USD)</label>
                      <NumberInput
                        value={monthlyContribution}
                        onChange={(val) =>
                          setMonthlyContribution(isNaN(val) ? 0 : val)
                        }
                        min={0}
                        decimals={0}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Frecuencia</label>
                      <select
                        value={contributionFrequency}
                        onChange={(e) =>
                          setContributionFrequency(
                            e.target.value as
                              | "weekly"
                              | "biweekly"
                              | "monthly"
                              | "quarterly"
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Bisemanal</option>
                        <option value="monthly">Mensual</option>
                        <option value="quarterly">Trimestral</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>
                        {contributionFrequency === "weekly" ||
                        contributionFrequency === "biweekly"
                          ? "Día de la Semana"
                          : "Día del Mes"}
                      </label>
                      {contributionFrequency === "weekly" ||
                      contributionFrequency === "biweekly" ? (
                        <select
                          value={contributionDayOfMonth}
                          onChange={(e) =>
                            setContributionDayOfMonth(parseInt(e.target.value))
                          }
                          style={inputStyle}
                        >
                          <option value={0}>Domingo</option>
                          <option value={1}>Lunes</option>
                          <option value={2}>Martes</option>
                          <option value={3}>Miércoles</option>
                          <option value={4}>Jueves</option>
                          <option value={5}>Viernes</option>
                          <option value={6}>Sábado</option>
                        </select>
                      ) : (
                        <NumberInput
                          value={contributionDayOfMonth}
                          onChange={(val) =>
                            setContributionDayOfMonth(
                              isNaN(val) ? 1 : Math.round(val)
                            )
                          }
                          min={1}
                          max={31}
                          decimals={0}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Summary */}
            {currentStep === 5 && (
              <div>
                <h2 style={stepTitleStyle}>Resumen</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Revisa tu configuración antes de crear el portfolio.
                </p>

                {/* Summary Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div style={summaryCardStyle}>
                    <h4
                      style={{
                        color: "var(--text-muted)",
                        margin: "0 0 0.5rem 0",
                        fontSize: "0.8rem",
                      }}
                    >
                      PORTFOLIO
                    </h4>
                    <p
                      style={{ color: "var(--text-primary)", fontWeight: "600", margin: 0 }}
                    >
                      {portfolioName}
                    </p>
                    <p style={{ color: "#22c55e", margin: "0.25rem 0 0 0" }}>
                      Capital inicial: {formatCurrencyES(initialCapital)}
                    </p>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4
                      style={{
                        color: "var(--text-muted)",
                        margin: "0 0 0.5rem 0",
                        fontSize: "0.8rem",
                      }}
                    >
                      ACTIVOS ({assets.length})
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      {assets.map((asset) => (
                        <span
                          key={asset.symbol}
                          style={{
                            padding: "0.25rem 0.75rem",
                            background: "rgba(59, 130, 246, 0.2)",
                            borderRadius: "999px",
                            color: "#60a5fa",
                            fontSize: "0.85rem",
                          }}
                        >
                          {asset.symbol}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4
                      style={{
                        color: "var(--text-muted)",
                        margin: "0 0 0.5rem 0",
                        fontSize: "0.8rem",
                      }}
                    >
                      ASIGNACIÓN DE PESOS
                    </h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {weightMethod === "sharpe" && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <TrendingUp size={16} />
                          Optimización Sharpe (automático)
                        </div>
                      )}
                      {weightMethod === "equal" && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Scale size={16} />
                          Pesos Iguales
                        </div>
                      )}
                      {weightMethod === "manual" && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Edit size={16} />
                          Asignación Manual
                        </div>
                      )}
                    </p>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4
                      style={{
                        color: "var(--text-muted)",
                        margin: "0 0 0.5rem 0",
                        fontSize: "0.8rem",
                      }}
                    >
                      LEVERAGE
                    </h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {leverageMin}x - {leverageMax}x (objetivo:{" "}
                      {leverageTarget}x)
                    </p>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4
                      style={{
                        color: "var(--text-muted)",
                        margin: "0 0 0.5rem 0",
                        fontSize: "0.8rem",
                      }}
                    >
                      APORTACIONES
                    </h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {formatCurrencyES(monthlyContribution)}{" "}
                      {contributionFrequency === "weekly" && "semanales"}
                      {contributionFrequency === "biweekly" && "bisemanales"}
                      {contributionFrequency === "monthly" && "mensuales"}
                      {contributionFrequency === "quarterly" && "trimestrales"}
                    </p>
                  </div>
                </div>

                {/* Info about historical data */}
                <div
                  style={{
                    marginTop: "1.5rem",
                    padding: "1rem",
                    background: "rgba(59, 130, 246, 0.1)",
                    borderRadius: "8px",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                  }}
                >
                  <p
                    style={{ color: "#60a5fa", margin: 0, fontSize: "0.9rem" }}
                  >
                    ℹ️ Al crear el portfolio, se descargará el histórico de
                    precios de los últimos 24 meses para cada activo. Esto puede
                    tomar unos segundos.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "8px",
                color: "#ef4444",
              }}
            >
              {error}
            </div>
          )}

          {/* Creation Progress */}
          {isSubmitting && creationProgress && (
            <div
              style={{
                marginTop: "1rem",
                padding: "1rem",
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
                color: "#60a5fa",
                textAlign: "center",
              }}
            >
              <div style={{ marginBottom: "0.5rem" }}>
                ⏳ {creationProgress}
              </div>
              <div
                style={{
                  height: "4px",
                  background: "rgba(59, 130, 246, 0.2)",
                  borderRadius: "2px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "#3b82f6",
                    width: "100%",
                    animation: "progress 2s ease-in-out infinite",
                  }}
                />
              </div>
              <style jsx>{`
                @keyframes progress {
                  0% {
                    transform: translateX(-100%);
                  }
                  100% {
                    transform: translateX(100%);
                  }
                }
              `}</style>
            </div>
          )}

          {/* Navigation Buttons */}
          <div style={navigationStyle}>
            <div>
              {currentStep > 1 && !isSubmitting && (
                <button onClick={handleBack} style={secondaryButtonStyle}>
                  ← Anterior
                </button>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              {currentStep < totalSteps && !isSubmitting && (
                <button
                  onClick={handleNext}
                  disabled={!canGoNext()}
                  style={{
                    ...primaryButtonStyle,
                    opacity: canGoNext() ? 1 : 0.5,
                    cursor: canGoNext() ? "pointer" : "not-allowed",
                  }}
                >
                  Siguiente →
                </button>
              )}
              {currentStep === totalSteps && !isSubmitting && (
                <button onClick={handleSubmit} style={submitButtonStyle}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Rocket size={18} />
                    Crear Portfolio
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================
// STYLES
// ============================================

const containerStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "2rem",
  background: "var(--bg-body)",
};

const cardStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "2rem",
  maxWidth: "700px",
  width: "100%",
};

const titleStyle: React.CSSProperties = {
  fontSize: "1.75rem",
  fontWeight: "700",
  color: "var(--text-primary)",
  marginBottom: "0.5rem",
};

const progressContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "0.5rem",
};

const progressDotStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "white",
  fontSize: "0.85rem",
  fontWeight: "600",
};

const progressLineStyle: React.CSSProperties = {
  width: "60px",
  height: "3px",
  margin: "0 4px",
};

const stepContentStyle: React.CSSProperties = {
  minHeight: "300px",
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: "600",
  color: "var(--text-primary)",
  marginBottom: "1rem",
};

const fieldStyle: React.CSSProperties = {
  marginBottom: "1.25rem",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontWeight: "500",
  color: "var(--text-secondary)",
  marginBottom: "0.5rem",
  fontSize: "0.9rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 1rem",
  background: "rgba(255, 255, 255, 0.05)",
  border: "1px solid var(--input-border)",
  borderRadius: "6px",
  color: "var(--text-primary)",
  fontSize: "0.95rem",
};

const helpStyle: React.CSSProperties = {
  color: "var(--text-dim)",
  fontSize: "0.8rem",
  marginTop: "0.5rem",
};

const assetItemStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0.75rem 1rem",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: "8px",
  border: "1px solid var(--input-border)",
};

const removeButtonStyle: React.CSSProperties = {
  width: "24px",
  height: "24px",
  borderRadius: "50%",
  background: "rgba(239, 68, 68, 0.2)",
  color: "#ef4444",
  border: "none",
  cursor: "pointer",
  fontSize: "0.9rem",
};

const methodOptionStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  padding: "1rem",
  border: "1px solid var(--input-border)",
  borderRadius: "8px",
  cursor: "pointer",
};

const weightSliderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1rem",
  padding: "0.75rem",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: "8px",
};

const sectionStyle: React.CSSProperties = {
  marginBottom: "1.5rem",
  padding: "1rem",
  background: "rgba(255, 255, 255, 0.02)",
  borderRadius: "8px",
  border: "1px solid var(--border)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "1rem",
  fontWeight: "600",
  color: "var(--text-primary)",
  marginBottom: "1rem",
};

const summaryCardStyle: React.CSSProperties = {
  padding: "1rem",
  background: "rgba(255, 255, 255, 0.03)",
  borderRadius: "8px",
  border: "1px solid var(--border)",
};

const navigationStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: "2rem",
  paddingTop: "1.5rem",
  borderTop: "1px solid var(--border)",
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.95rem",
  fontWeight: "600",
  cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--input-border)",
  borderRadius: "6px",
  fontSize: "0.95rem",
  fontWeight: "500",
  cursor: "pointer",
};

const submitButtonStyle: React.CSSProperties = {
  padding: "0.75rem 1.5rem",
  background: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
  color: "white",
  border: "none",
  borderRadius: "6px",
  fontSize: "0.95rem",
  fontWeight: "600",
  cursor: "pointer",
};
