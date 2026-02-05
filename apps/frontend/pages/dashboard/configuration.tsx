import React, { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../contexts/AuthContext";
import {
  getPortfoliosByEmail,
  getPortfolioConfiguration,
  updatePortfolioConfiguration,
  PortfolioConfiguration,
  TargetWeight,
  getRiskProfiles,
  RiskProfile,
  RiskProfileId,
  getTargetAssets,
  addTargetAsset,
  removeTargetAsset,
  TargetAsset,
  searchSymbols,
} from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import { invalidatePortfolioCache } from "../../lib/hooks/use-portfolio-data";
import {
  DollarSign,
  BarChart,
  TrendingUp,
  Settings,
  Scale,
  Edit,
  Shield,
  Briefcase,
  Plus,
  Trash2,
  Search,
  Loader2,
  X,
} from "lucide-react";
import { NumberInput } from "../../components/NumberInput";
import { Tooltip } from "../../components/Tooltip";
import { RiskProfileSelector } from "../../components/RiskProfileSelector";
import { formatNumberES, formatPercentES } from "../../lib/number-format";

/**
 * Portfolio Configuration Page
 * Allows users to customize strategy parameters, leverage range, and target weights
 */
export default function Configuration() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [_config, setConfig] = useState<PortfolioConfiguration | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Form state for editable fields
  const [formData, setFormData] = useState({
    monthlyContribution: 0,
    contributionFrequency: "monthly" as
      | "weekly"
      | "biweekly"
      | "monthly"
      | "quarterly",
    contributionDayOfMonth: 1,
    contributionEnabled: true,
    leverageMin: 2.5,
    leverageMax: 4.0,
    leverageTarget: 3.0,
    useDynamicSharpeRebalance: true,
    sharpeWeightsLookbackMonths: 0,
    meanReturnShrinkage: 0.6,
    riskFreeRate: 0.02,
    maintenanceMarginRatio: 0.05,
    safeMarginRatio: 0.15,
    criticalMarginRatio: 0.1,
    maxWeight: 0.4,
    minWeight: 0.05,
  });

  const [targetWeights, setTargetWeights] = useState<TargetWeight[]>([]);

  // Target assets state (what user wants to hold)
  const [targetAssets, setTargetAssets] = useState<TargetAsset[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [tickerSearch, setTickerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ symbol: string; name: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAddingAsset, setIsAddingAsset] = useState(false);
  const [removingAsset, setRemovingAsset] = useState<string | null>(null);

  // Risk profile state
  const [riskProfiles, setRiskProfiles] = useState<RiskProfile[]>([]);
  const [selectedRiskProfile, setSelectedRiskProfile] = useState<RiskProfileId | null>(null);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  // Load risk profiles on mount
  useEffect(() => {
    async function loadRiskProfiles() {
      try {
        const profiles = await getRiskProfiles();
        setRiskProfiles(profiles);
      } catch (err) {
        console.error("Failed to load risk profiles:", err);
      } finally {
        setIsLoadingProfiles(false);
      }
    }
    loadRiskProfiles();
  }, []);

  // Load portfolio and configuration
  useEffect(() => {
    async function loadConfig() {
      const urlPortfolioId = router.query.portfolioId as string;
      let pId = urlPortfolioId;

      if (!pId && user?.email) {
        try {
          const portfolios = await getPortfoliosByEmail(user.email);
          if (portfolios && portfolios.length > 0) {
            pId = portfolios[0].id;
          }
        } catch {
          setError("Failed to load portfolio");
          setIsLoading(false);
          return;
        }
      }

      if (pId) {
        setPortfolioId(pId);
        try {
          const configData = await getPortfolioConfiguration(pId);
          setConfig(configData);
          setFormData({
            monthlyContribution: configData.monthlyContribution || 0,
            contributionFrequency:
              configData.contributionFrequency || "monthly",
            contributionDayOfMonth: configData.contributionDayOfMonth || 1,
            contributionEnabled: configData.contributionEnabled ?? true,
            leverageMin: configData.leverageMin || 2.5,
            leverageMax: configData.leverageMax || 4.0,
            leverageTarget: configData.leverageTarget || 3.0,
            useDynamicSharpeRebalance:
              configData.useDynamicSharpeRebalance ?? true,
            sharpeWeightsLookbackMonths:
              configData.sharpeWeightsLookbackMonths ?? 0,
            meanReturnShrinkage: configData.meanReturnShrinkage || 0.6,
            riskFreeRate: configData.riskFreeRate || 0.02,
            maintenanceMarginRatio: configData.maintenanceMarginRatio || 0.05,
            safeMarginRatio: configData.safeMarginRatio || 0.15,
            criticalMarginRatio: configData.criticalMarginRatio || 0.1,
            maxWeight: configData.maxWeight || 0.4,
            minWeight: configData.minWeight || 0.05,
          });
          setTargetWeights(configData.targetWeights || []);
          // Set risk profile from backend response
          setSelectedRiskProfile(configData.riskProfile || null);
        } catch {
          setError("Failed to load configuration");
        }
      }
      setIsLoading(false);
    }

    if (!router.isReady || loading) return;
    if (!user) {
      router.push("/");
    } else {
      loadConfig();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, router.isReady, router.query.portfolioId]);

  // Load target assets when portfolioId changes
  useEffect(() => {
    async function loadTargetAssets() {
      if (!portfolioId) return;
      setIsLoadingAssets(true);
      try {
        const assets = await getTargetAssets(portfolioId);
        setTargetAssets(assets);
      } catch (err) {
        console.error("Failed to load target assets:", err);
      } finally {
        setIsLoadingAssets(false);
      }
    }
    loadTargetAssets();
  }, [portfolioId]);

  // Debounced ticker search
  useEffect(() => {
    if (tickerSearch.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSymbols(tickerSearch);
        // Filter out assets already in portfolio
        const existingSymbols = new Set(targetAssets.map(a => a.symbol));
        setSearchResults(results.filter(r => !existingSymbols.has(r.symbol)));
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [tickerSearch, targetAssets]);

  // Add a new target asset
  const handleAddAsset = async (symbol: string) => {
    if (!portfolioId) return;
    setIsAddingAsset(true);
    try {
      await addTargetAsset(portfolioId, { symbol });
      // Reload ALL target assets since backend normalizes weights
      const updatedAssets = await getTargetAssets(portfolioId);
      setTargetAssets(updatedAssets);
      // Also update targetWeights for the weights section
      setTargetWeights(updatedAssets.map(a => ({ symbol: a.symbol, weight: a.targetWeight })));
      setTickerSearch("");
      setSearchResults([]);
      setMessage(`✅ ${symbol} añadido al portfolio`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error al añadir ${symbol}`);
    } finally {
      setIsAddingAsset(false);
    }
  };

  // Remove a target asset
  const handleRemoveAsset = async (symbol: string) => {
    if (!portfolioId) return;
    setRemovingAsset(symbol);
    try {
      await removeTargetAsset(portfolioId, symbol);
      // Reload ALL target assets since backend normalizes weights
      const updatedAssets = await getTargetAssets(portfolioId);
      setTargetAssets(updatedAssets);
      // Also update targetWeights
      setTargetWeights(updatedAssets.map(a => ({ symbol: a.symbol, weight: a.targetWeight })));
      setMessage(`✅ ${symbol} eliminado del portfolio`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Error al eliminar ${symbol}`);
    } finally {
      setRemovingAsset(null);
    }
  };

  // Update leverage values when risk profile changes
  const handleRiskProfileChange = (profileId: RiskProfileId | null) => {
    setSelectedRiskProfile(profileId);
    if (profileId && riskProfiles.length > 0) {
      const profile = riskProfiles.find(p => p.id === profileId);
      if (profile) {
        setFormData(prev => ({
          ...prev,
          leverageMin: profile.params.leverageMin,
          leverageMax: profile.params.leverageMax,
          leverageTarget: profile.params.leverageTarget,
          maintenanceMarginRatio: profile.params.maintenanceMarginRatio,
          meanReturnShrinkage: profile.params.meanReturnShrinkage,
          maxWeight: profile.params.maxWeight,
          minWeight: profile.params.minWeight,
        }));
      }
    }
  };

  const handleInputChange = (
    field: string,
    value: number | boolean | string
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleWeightChange = (index: number, weight: number) => {
    setTargetWeights((prev) =>
      prev.map((tw, i) => (i === index ? { ...tw, weight } : tw))
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!portfolioId) return;

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      // Only validate weights sum when in manual mode
      // In Sharpe mode, weights are read-only and managed by the system
      if (!formData.useDynamicSharpeRebalance) {
        const totalWeight = targetWeights.reduce((sum, tw) => sum + tw.weight, 0);
        if (Math.abs(totalWeight - 1) > 0.01) {
          setError(
            `Los pesos objetivo deben sumar 100%. Actualmente: ${formatNumberES(
              totalWeight * 100,
              {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }
            )}%`
          );
          setIsSaving(false);
          return;
        }
      }

      await updatePortfolioConfiguration(portfolioId, {
        ...formData,
        targetWeights,
        riskProfile: selectedRiskProfile,
      });

      // Invalidate cache, especially recommendations which depend on configuration
      invalidatePortfolioCache(portfolioId, user?.email);

      setMessage("✅ Configuración guardada correctamente");
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al guardar configuración"
      );
    } finally {
      setIsSaving(false);
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
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  if (!user) return null;

  const totalWeight = targetWeights.reduce((sum, tw) => sum + tw.weight, 0);
  // Weights are always valid in Sharpe mode (read-only), only check in manual mode
  const weightsValid = formData.useDynamicSharpeRebalance || Math.abs(totalWeight - 1) <= 0.01;

  return (
    <>
      <Head>
        <title>Configuración - Leveraged DCA App</title>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @media (max-width: 768px) {
            .config-wrapper {
              padding: 1rem !important;
              padding-top: 4rem !important;
            }
            .config-grid {
              grid-template-columns: 1fr !important;
              gap: 1rem !important;
            }
            .config-actions {
              flex-direction: column-reverse !important;
            }
            .config-actions button {
              width: 100% !important;
            }
          }
          @media (max-width: 480px) {
            .config-wrapper {
              padding: 0.75rem !important;
              padding-top: 4rem !important;
            }
          }
        `}} />
      </Head>
      <DashboardSidebar portfolioId={portfolioId}>
        <div
          style={{
            padding: "2rem",
            paddingTop: "4rem",
          }}
          className="config-wrapper"
        >
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Settings size={24} />
                  Configuración del Portfolio
                </div>
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Personaliza los parámetros de la estrategia DCA apalancada
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Risk Profile Selector */}
              <ConfigSection
                title={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Shield size={18} />
                    Perfil de Riesgo
                  </div>
                }
              >
                {isLoadingProfiles ? (
                  <div style={{ textAlign: "center", padding: "1rem", color: "var(--text-muted)" }}>
                    Cargando perfiles...
                  </div>
                ) : (
                  <>
                    <RiskProfileSelector
                      profiles={riskProfiles}
                      selected={selectedRiskProfile}
                      onSelect={handleRiskProfileChange}
                      showCustomOption={true}
                      compact={false}
                    />
                    {selectedRiskProfile && (
                      <div
                        style={{
                          marginTop: "1rem",
                          padding: "0.75rem 1rem",
                          background: "rgba(59, 130, 246, 0.1)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          borderRadius: "8px",
                          fontSize: "0.85rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Los parámetros de leverage y optimización se han ajustado según el perfil seleccionado.
                        Puedes modificarlos manualmente si lo deseas.
                      </div>
                    )}
                  </>
                )}
              </ConfigSection>

              {/* Portfolio Assets - What user WANTS to hold */}
              <ConfigSection
                title={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Briefcase size={18} />
                    Activos del Portfolio
                    <Tooltip text="Define qué activos quieres tener en tu portfolio. Al añadir o eliminar activos, los pesos se redistribuyen automáticamente." />
                  </div>
                }
              >
                {/* Search for new assets */}
                <div style={{ marginBottom: "1rem", position: "relative" }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "500",
                      marginBottom: "0.5rem",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    Añadir nuevo activo
                  </label>
                  <div style={{ position: "relative" }}>
                    <Search
                      size={16}
                      style={{
                        position: "absolute",
                        left: "0.75rem",
                        top: "50%",
                        transform: "translateY(-50%)",
                        color: "var(--text-muted)",
                      }}
                    />
                    <input
                      type="text"
                      value={tickerSearch}
                      onChange={(e) => setTickerSearch(e.target.value.toUpperCase())}
                      placeholder="Buscar ticker (ej: AAPL, BTC-USD, GLD)"
                      style={{
                        width: "100%",
                        padding: "0.625rem 0.875rem 0.625rem 2.25rem",
                        background: "var(--input-bg)",
                        color: "var(--input-color)",
                        border: "1px solid var(--input-border)",
                        borderRadius: "6px",
                        fontSize: "0.95rem",
                      }}
                    />
                    {tickerSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setTickerSearch("");
                          setSearchResults([]);
                        }}
                        style={{
                          position: "absolute",
                          right: "0.5rem",
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "0.25rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  {/* Search results dropdown */}
                  {(searchResults.length > 0 || isSearching) && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        background: "var(--bg-card)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        marginTop: "0.25rem",
                        maxHeight: "200px",
                        overflowY: "auto",
                        zIndex: 100,
                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                      }}
                    >
                      {isSearching ? (
                        <div
                          style={{
                            padding: "0.75rem",
                            textAlign: "center",
                            color: "var(--text-muted)",
                          }}
                        >
                          <Loader2
                            size={16}
                            style={{ animation: "spin 1s linear infinite" }}
                          />
                          {" "}Buscando...
                        </div>
                      ) : (
                        searchResults.map((result) => (
                          <button
                            key={result.symbol}
                            type="button"
                            onClick={() => handleAddAsset(result.symbol)}
                            disabled={isAddingAsset}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              width: "100%",
                              padding: "0.625rem 0.875rem",
                              background: "transparent",
                              border: "none",
                              cursor: isAddingAsset ? "wait" : "pointer",
                              textAlign: "left",
                              color: "var(--text-primary)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "var(--hover-bg)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: "600" }}>{result.symbol}</div>
                              <div
                                style={{
                                  fontSize: "0.8rem",
                                  color: "var(--text-muted)",
                                }}
                              >
                                {result.name}
                              </div>
                            </div>
                            <Plus size={16} style={{ color: "#22c55e" }} />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Current assets list */}
                {isLoadingAssets ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "1rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Cargando activos...
                  </div>
                ) : targetAssets.length > 0 ? (
                  <div style={{ marginTop: "0.5rem" }}>
                    {targetAssets.map((asset) => (
                      <div
                        key={asset.symbol}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "0.75rem",
                          background: "var(--hover-bg)",
                          borderRadius: "8px",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "600",
                                color: "var(--text-primary)",
                              }}
                            >
                              {asset.symbol}
                            </span>
                            <span
                              style={{
                                fontSize: "0.75rem",
                                padding: "0.125rem 0.375rem",
                                background: asset.hasPosition
                                  ? "rgba(34, 197, 94, 0.2)"
                                  : "rgba(251, 191, 36, 0.2)",
                                color: asset.hasPosition ? "#22c55e" : "#fbbf24",
                                borderRadius: "4px",
                              }}
                            >
                              {asset.hasPosition ? "Con posición" : "Sin comprar"}
                            </span>
                          </div>
                          {/* Only show name if different from symbol */}
                          {asset.name && asset.name !== asset.symbol && (
                            <div
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--text-muted)",
                                marginTop: "0.125rem",
                              }}
                            >
                              {asset.name}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset(asset.symbol)}
                          disabled={removingAsset === asset.symbol}
                          style={{
                            background: "transparent",
                            border: "none",
                            cursor: removingAsset === asset.symbol ? "wait" : "pointer",
                            padding: "0.5rem",
                            color: "#ef4444",
                            opacity: removingAsset === asset.symbol ? 0.5 : 1,
                          }}
                          title={`Eliminar ${asset.symbol}`}
                        >
                          {removingAsset === asset.symbol ? (
                            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    ))}
                    <div
                      style={{
                        marginTop: "0.75rem",
                        padding: "0.5rem 0.75rem",
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.2)",
                        borderRadius: "6px",
                        fontSize: "0.8rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      💡 Al añadir o eliminar activos, los pesos se redistribuyen automáticamente.
                      Puedes ajustar los pesos en la sección de abajo.
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "1.5rem",
                      background: "var(--hover-bg)",
                      borderRadius: "8px",
                      color: "var(--text-muted)",
                    }}
                  >
                    No hay activos configurados. Busca y añade activos arriba.
                  </div>
                )}
              </ConfigSection>

              {/* Contribution Settings */}
              <ConfigSection
                title={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <DollarSign size={18} />
                    Aportación Periódica
                  </div>
                }
              >
                <div style={gridStyle} className="config-grid">
                  <InputField
                    label="Monto de Aportación (USD)"
                    value={formData.monthlyContribution}
                    onChange={(v) =>
                      handleInputChange("monthlyContribution", v)
                    }
                    type="number"
                    min={0}
                    step={100}
                  />
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: "500",
                        marginBottom: "0.5rem",
                        color: "var(--text-secondary)",
                        fontSize: "0.875rem",
                      }}
                    >
                      Frecuencia
                    </label>
                    <select
                      value={formData.contributionFrequency}
                      onChange={(e) =>
                        handleInputChange(
                          "contributionFrequency",
                          e.target.value as
                            | "weekly"
                            | "biweekly"
                            | "monthly"
                            | "quarterly"
                        )
                      }
                      style={{
                        width: "100%",
                        padding: "0.625rem 0.875rem",
                        background: "var(--input-bg)",
                        color: "var(--input-color)",
                        border: "1px solid var(--input-border)",
                        borderRadius: "6px",
                        fontSize: "0.95rem",
                      }}
                    >
                      <option value="weekly">Semanal</option>
                      <option value="biweekly">Bisemanal</option>
                      <option value="monthly">Mensual</option>
                      <option value="quarterly">Trimestral</option>
                    </select>
                  </div>
                  {formData.contributionFrequency === "weekly" ||
                  formData.contributionFrequency === "biweekly" ? (
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: "500",
                          marginBottom: "0.5rem",
                          color: "var(--text-secondary)",
                          fontSize: "0.875rem",
                        }}
                      >
                        Día de la Semana
                      </label>
                      <select
                        value={formData.contributionDayOfMonth}
                        onChange={(e) =>
                          handleInputChange(
                            "contributionDayOfMonth",
                            parseInt(e.target.value)
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "0.625rem 0.875rem",
                          background: "var(--input-bg)",
                          color: "var(--input-color)",
                          border: "1px solid var(--input-border)",
                          borderRadius: "6px",
                          fontSize: "0.95rem",
                        }}
                      >
                        <option value={0}>Domingo</option>
                        <option value={1}>Lunes</option>
                        <option value={2}>Martes</option>
                        <option value={3}>Miércoles</option>
                        <option value={4}>Jueves</option>
                        <option value={5}>Viernes</option>
                        <option value={6}>Sábado</option>
                      </select>
                    </div>
                  ) : (
                    <InputField
                      label={
                        formData.contributionFrequency === "monthly"
                          ? "Día del Mes"
                          : "Día del Mes (Ene, Abr, Jul, Oct)"
                      }
                      value={formData.contributionDayOfMonth}
                      onChange={(v) =>
                        handleInputChange("contributionDayOfMonth", v)
                      }
                      type="number"
                      min={1}
                      max={31}
                    />
                  )}
                  <CheckboxField
                    label="Aportaciones Habilitadas"
                    checked={formData.contributionEnabled}
                    onChange={(v) =>
                      handleInputChange("contributionEnabled", v)
                    }
                  />
                </div>
              </ConfigSection>

              {/* Leverage Settings - Only visible with custom profile */}
              {selectedRiskProfile === null && (
                <ConfigSection
                  title={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <BarChart size={18} />
                      Rango de Leverage
                      <Tooltip text="El sistema recomendará reborrow cuando el leverage baje del mínimo, y aporte extra cuando suba del máximo." />
                    </div>
                  }
                >
                  <div style={gridStyle}>
                    <InputField
                      label="Leverage Mínimo"
                      value={formData.leverageMin}
                      onChange={(v) => handleInputChange("leverageMin", v)}
                      type="number"
                      min={1}
                      max={10}
                      step={0.1}
                      suffix="x"
                    />
                    <InputField
                      label="Leverage Máximo"
                      value={formData.leverageMax}
                      onChange={(v) => handleInputChange("leverageMax", v)}
                      type="number"
                      min={1}
                      max={10}
                      step={0.1}
                      suffix="x"
                    />
                    <InputField
                      label="Leverage Objetivo"
                      value={formData.leverageTarget}
                      onChange={(v) => handleInputChange("leverageTarget", v)}
                      type="number"
                      min={1}
                      max={10}
                      step={0.1}
                      suffix="x"
                    />
                  </div>
                </ConfigSection>
              )}

              {/* Target Weights */}
              <ConfigSection
                title={
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <Scale size={18} />
                    Asignación de Pesos
                  </div>
                }
              >
                {/* Weight allocation method selector */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "500",
                      marginBottom: "0.75rem",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    Método de Asignación
                  </label>
                  <div
                    style={{
                      display: "flex",
                      gap: "1rem",
                      alignItems: "center",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        padding: "0.75rem 1rem",
                        background: formData.useDynamicSharpeRebalance
                          ? "rgba(59, 130, 246, 0.2)"
                          : "var(--input-bg)",
                        border: formData.useDynamicSharpeRebalance
                          ? "1px solid #3b82f6"
                          : "1px solid var(--input-border)",
                        borderRadius: "8px",
                        flex: 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="weightMethod"
                        checked={formData.useDynamicSharpeRebalance}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            useDynamicSharpeRebalance: true,
                          })
                        }
                        style={{ accentColor: "#3b82f6" }}
                      />
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            color: "var(--text-primary)",
                            fontWeight: "600",
                          }}
                        >
                          <TrendingUp size={16} />
                          Optimización Automática
                          <Tooltip text="Los pesos de cada activo se calculan automáticamente usando el ratio de Sharpe, que maximiza el rendimiento ajustado por riesgo. El sistema analiza el histórico de precios para encontrar la combinación óptima." />
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.75rem",
                            marginTop: "0.25rem",
                          }}
                        >
                          Los pesos se calculan automáticamente para maximizar
                          el rendimiento ajustado por riesgo
                        </div>
                      </div>
                    </label>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        cursor: "pointer",
                        padding: "0.75rem 1rem",
                        background: !formData.useDynamicSharpeRebalance
                          ? "rgba(59, 130, 246, 0.2)"
                          : "var(--input-bg)",
                        border: !formData.useDynamicSharpeRebalance
                          ? "1px solid #3b82f6"
                          : "1px solid var(--input-border)",
                        borderRadius: "8px",
                        flex: 1,
                      }}
                    >
                      <input
                        type="radio"
                        name="weightMethod"
                        checked={!formData.useDynamicSharpeRebalance}
                        onChange={() =>
                          setFormData({
                            ...formData,
                            useDynamicSharpeRebalance: false,
                          })
                        }
                        style={{ accentColor: "#3b82f6" }}
                      />
                      <div>
                        <div style={{ color: "var(--text-primary)", fontWeight: "600" }}>
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
                            fontSize: "0.75rem",
                            marginTop: "0.25rem",
                          }}
                        >
                          Define manualmente los pesos objetivo de cada activo
                        </div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Show target weights */}
                {targetWeights.length > 0 ? (
                  formData.useDynamicSharpeRebalance ? (
                    /* READ-ONLY view when Sharpe optimization is enabled */
                    <>
                      <div
                        style={{
                          padding: "1rem",
                          background: "rgba(59, 130, 246, 0.1)",
                          border: "1px solid rgba(59, 130, 246, 0.3)",
                          borderRadius: "8px",
                          color: "var(--text-secondary)",
                          fontSize: "0.85rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                          <TrendingUp size={18} style={{ color: "#3b82f6" }} />
                          <strong style={{ color: "var(--text-primary)" }}>Optimización automática activa</strong>
                        </div>
                        <p style={{ margin: 0, lineHeight: 1.5 }}>
                          Los pesos óptimos de cada activo se calcularán automáticamente cuando vayas a la
                          página de <strong>Rebalanceo</strong>, usando el ratio de Sharpe para maximizar
                          el rendimiento ajustado por riesgo.
                        </p>
                        <p style={{ margin: "0.75rem 0 0", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                          Los activos incluidos en el cálculo son los que has configurado arriba en &quot;Activos del Portfolio&quot;.
                        </p>
                      </div>
                    </>
                  ) : (
                    /* EDITABLE view when manual allocation is selected */
                    <>
                      <div style={{ marginBottom: "1rem" }}>
                        {targetWeights.map((tw, idx) => (
                          <div
                            key={tw.symbol}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "1rem",
                              marginBottom: "0.75rem",
                              padding: "0.75rem",
                              background: "var(--hover-bg)",
                              borderRadius: "8px",
                            }}
                          >
                            <span
                              style={{
                                color: "var(--text-primary)",
                                fontWeight: "600",
                                minWidth: "100px",
                              }}
                            >
                              {tw.symbol}
                            </span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={tw.weight * 100}
                              onChange={(e) =>
                                handleWeightChange(
                                  idx,
                                  parseFloat(e.target.value) / 100
                                )
                              }
                              style={{
                                flex: 1,
                                accentColor: "#3b82f6",
                              }}
                            />
                            <NumberInput
                              value={tw.weight * 100}
                              onChange={(val) =>
                                handleWeightChange(
                                  idx,
                                  isNaN(val) ? 0 : val / 100
                                )
                              }
                              min={0}
                              max={100}
                              step={1}
                              decimals={1}
                              style={{
                                width: "70px",
                                padding: "0.5rem",
                                background: "var(--bg-glass)",
                                color: "var(--input-color)",
                                border: "1px solid var(--input-border)",
                                borderRadius: "4px",
                                fontSize: "0.9rem",
                                textAlign: "right",
                              }}
                            />
                            <span style={{ color: "var(--text-muted)" }}>%</span>
                          </div>
                        ))}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.75rem 1rem",
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
                          Total:{" "}
                          {formatNumberES(totalWeight * 100, {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </span>
                        {!weightsValid && (
                          <span
                            style={{ color: "#f87171", fontSize: "0.875rem" }}
                          >
                            Los pesos deben sumar 100%
                          </span>
                        )}
                      </div>
                    </>
                  )
                ) : (
                  <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                    No hay activos configurados. Actualiza las posiciones del
                    portfolio primero.
                  </p>
                )}

                {/* Weight Limits - Only visible when Sharpe optimization AND custom profile */}
                {formData.useDynamicSharpeRebalance && selectedRiskProfile === null && (
                  <div style={{ marginTop: "1.5rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <h3
                        style={{
                          fontSize: "1rem",
                          fontWeight: "600",
                          color: "var(--text-primary)",
                          margin: 0,
                        }}
                      >
                        📏 Límites de Peso
                      </h3>
                    </div>
                    <div style={gridStyle}>
                      <InputField
                        label="Peso Máximo por Activo"
                        value={formData.maxWeight * 100}
                        onChange={(v) =>
                          handleInputChange("maxWeight", v / 100)
                        }
                        type="number"
                        min={10}
                        max={100}
                        step={5}
                        suffix="%"
                        help="Peso máximo permitido para cualquier activo individual"
                      />
                      <InputField
                        label="Peso Mínimo por Activo"
                        value={formData.minWeight * 100}
                        onChange={(v) =>
                          handleInputChange("minWeight", v / 100)
                        }
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        suffix="%"
                        help="Peso mínimo permitido para cualquier activo individual"
                      />
                    </div>
                  </div>
                )}
              </ConfigSection>

              {/* Advanced Optimization - Only visible when auto optimization AND custom profile */}
              {formData.useDynamicSharpeRebalance && selectedRiskProfile === null && (
                <ConfigSection
                  title={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <TrendingUp size={18} />
                      Parámetros de Optimización
                      <Tooltip text="Ajustes avanzados para el algoritmo de optimización automática de pesos." />
                    </div>
                  }
                >
                  <div style={gridStyle}>
                    <InputField
                      label="Lookback (meses)"
                      value={formData.sharpeWeightsLookbackMonths}
                      onChange={(v) =>
                        handleInputChange("sharpeWeightsLookbackMonths", v)
                      }
                      type="number"
                      min={0}
                      max={60}
                      step={1}
                      help="Meses de histórico para optimización Sharpe. 0 = usar todo el histórico disponible. Valores típicos: 12-24 meses. Menos meses = más reactivo, más meses = más estable."
                    />
                    <InputField
                      label="Shrinkage Retornos"
                      value={formData.meanReturnShrinkage}
                      onChange={(v) =>
                        handleInputChange("meanReturnShrinkage", v)
                      }
                      type="number"
                      min={0}
                      max={1}
                      step={0.1}
                      help="Factor de contracción hacia media global (0-1). Reduce el sobreajuste en la estimación de retornos medios. Valores más altos (cerca de 1) usan más los retornos históricos, valores más bajos (cerca de 0) contraen más hacia cero."
                    />
                    <InputField
                      label="Tasa Libre de Riesgo"
                      value={formData.riskFreeRate * 100}
                      onChange={(v) =>
                        handleInputChange("riskFreeRate", v / 100)
                      }
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      suffix="%"
                      help="Tasa de interés libre de riesgo anual (ej: bonos del tesoro). Se usa para calcular el Sharpe Ratio: (Retorno - Tasa Libre de Riesgo) / Volatilidad. Valores típicos: 2-3%."
                    />
                  </div>
                </ConfigSection>
              )}

              {/* Margin Settings - Only visible with custom profile */}
              {selectedRiskProfile === null && (
                <ConfigSection
                  title={
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <Shield size={18} />
                      Márgenes de Seguridad
                    </div>
                  }
                >
                  <div style={gridStyle}>
                    <InputField
                      label="Margen de Mantenimiento"
                      value={formData.maintenanceMarginRatio * 100}
                      onChange={(v) =>
                        handleInputChange("maintenanceMarginRatio", v / 100)
                      }
                      type="number"
                      min={1}
                      max={50}
                      step={1}
                      suffix="%"
                      help="Margen mínimo requerido por el broker (5% típico)"
                    />
                    <InputField
                      label="Margen Seguro"
                      value={(formData.safeMarginRatio || 0.15) * 100}
                      onChange={(v) =>
                        handleInputChange("safeMarginRatio", v / 100)
                      }
                      type="number"
                      min={5}
                      max={50}
                      step={1}
                      suffix="%"
                      help="Nivel de margen cómodo para operar"
                    />
                    <InputField
                      label="Margen Crítico"
                      value={(formData.criticalMarginRatio || 0.1) * 100}
                      onChange={(v) =>
                        handleInputChange("criticalMarginRatio", v / 100)
                      }
                      type="number"
                      min={1}
                      max={30}
                      step={1}
                      suffix="%"
                      help="Alerta urgente si el margen baja de este nivel"
                    />
                  </div>
                </ConfigSection>
              )}

              {/* Submit button */}
              <div
                style={{
                  marginTop: "2rem",
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "flex-end",
                  flexWrap: "wrap",
                }}
                className="config-actions"
              >
                <button
                  type="submit"
                  disabled={isSaving || !weightsValid}
                  style={{
                    padding: "0.875rem 2rem",
                    background:
                      isSaving || !weightsValid
                        ? "var(--disabled-bg)"
                        : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: isSaving || !weightsValid ? "var(--disabled-color)" : "white",
                    border: isSaving || !weightsValid ? "1px solid var(--disabled-border)" : "none",
                    borderRadius: "6px",
                    fontSize: "0.95rem",
                    fontWeight: "600",
                    cursor:
                      isSaving || !weightsValid ? "not-allowed" : "pointer",
                    opacity: isSaving || !weightsValid ? 0.5 : 1,
                  }}
                >
                  {isSaving ? "Guardando..." : "Guardar Configuración"}
                </button>
              </div>
            </form>

            {/* Messages */}
            {message && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  background: "rgba(34, 197, 94, 0.1)",
                  color: "#22c55e",
                  borderRadius: "8px",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                }}
              >
                {message}
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1rem",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  borderRadius: "8px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
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

// Styles
const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: "1.25rem",
};

// Components
function ConfigSection({
  title,
  children,
}: {
  title: string | React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "1.5rem",
        marginBottom: "1.5rem",
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
        {title}
      </h2>
      {children}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = "number",
  min,
  max,
  step,
  suffix,
  help,
  decimals,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  type?: "number" | "text";
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  help?: string;
  decimals?: number;
}) {
  // Determine decimals based on step if not provided
  const decimalPlaces =
    decimals !== undefined
      ? decimals
      : step && step < 1
      ? step.toString().split(".")[1]?.length || 2
      : step === 0.1
      ? 1
      : 0;

  return (
    <div>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          fontWeight: "500",
          marginBottom: "0.5rem",
          color: "var(--text-secondary)",
          fontSize: "0.875rem",
        }}
      >
        {label}
        {help && <Tooltip text={help} />}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {type === "number" ? (
          <NumberInput
            value={value}
            onChange={onChange}
            min={min}
            max={max}
            step={step}
            decimals={decimalPlaces}
            style={{
              flex: 1,
              padding: "0.625rem 0.875rem",
              background: "var(--input-bg)",
              color: "var(--input-color)",
              border: "1px solid var(--input-border)",
              borderRadius: "6px",
              fontSize: "0.95rem",
            }}
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
            style={{
              flex: 1,
              padding: "0.625rem 0.875rem",
              background: "var(--input-bg)",
              color: "var(--input-color)",
              border: "1px solid var(--input-border)",
              borderRadius: "6px",
              fontSize: "0.95rem",
            }}
          />
        )}
        {suffix && (
          <span
            style={{ color: "var(--text-muted)", fontSize: "0.9rem", minWidth: "30px" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem 0",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: "20px",
          height: "20px",
          accentColor: "#3b82f6",
          cursor: "pointer",
        }}
      />
      <label
        style={{
          color: "var(--text-secondary)",
          fontSize: "0.9rem",
          cursor: "pointer",
        }}
        onClick={() => onChange(!checked)}
      >
        {label}
      </label>
    </div>
  );
}
