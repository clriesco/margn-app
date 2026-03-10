import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth, useUser, useClerk } from "@clerk/nextjs";
import {
  searchSymbols,
  createPortfolio,
  OnboardingAsset,
  CreatePortfolioRequest,
  SymbolSearchResult,
  RiskProfile,
  RiskProfileId,
  getPublicStrategies,
  PublicStrategySummary,
} from "../../lib/api";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { usePageState } from "../../lib/hooks/use-page-state";
import { invalidatePortfolioCache, useRiskProfiles } from "../../lib/hooks/use-portfolio-data";
import {
  Rocket,
  TrendingUp,
  BarChart,
  DollarSign,
  Scale,
  Edit,
  LogOut,
  Settings,
} from "lucide-react";
import { NumberInput } from "../../components/NumberInput";
import { RiskProfileSelector } from "../../components/RiskProfileSelector";
import { StrategyCard } from "../../components/StrategyCard";
import {
  formatCurrencyES,
  formatPercentES,
  formatNumberES,
} from "../../lib/number-format";

/**
 * Onboarding page - wizard for creating first portfolio
 *
 * Flow:
 * 1. Risk Profile
 * 2. Strategy Selection (platform strategies or "Custom")
 * 3. [Custom only] Select Assets
 * 4. [Custom only] Assign Weights
 * 5. Basic Info (name, capital)
 * 6. Contributions
 * 7. Summary + Create
 *
 * If a strategy is selected, steps 3-4 are skipped and assets/weights
 * are pre-filled from the strategy config.
 */
export default function Onboarding() {
  const router = useRouter();
  const { getToken, isLoaded } = useAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const user = useMemo(() => clerkUser ? { email: clerkUser.primaryEmailAddress?.emailAddress ?? "" } : null, [clerkUser]);
  const loading = !isLoaded;
  const { setActivePortfolioId, refreshPortfolios } = usePortfolio();

  // Wizard state
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Risk Profile
  const { riskProfiles, isLoading: isLoadingProfiles } = useRiskProfiles();
  const [selectedRiskProfile, setSelectedRiskProfile] = useState<RiskProfileId | null>("moderate");

  // Leverage (derived from risk profile or custom)
  const [leverageMin, setLeverageMin] = useState(2.0);
  const [leverageMax, setLeverageMax] = useState(3.0);
  const [leverageTarget, setLeverageTarget] = useState(2.5);

  // Step 2: Strategy Selection
  const [platformStrategies, setPlatformStrategies] = useState<PublicStrategySummary[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<PublicStrategySummary | null>(null);
  const [isCustomPath, setIsCustomPath] = useState(false);

  // Step 3: Assets (custom path only)
  const [assets, setAssets] = useState<OnboardingAsset[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = React.useRef<HTMLDivElement | null>(null);

  // Step 4: Weights (custom path only)
  const [weightMethod, setWeightMethod] = useState<"sharpe" | "manual" | "equal">("sharpe");
  const [manualWeights, setManualWeights] = useState<Record<string, number>>({});

  // Step 5: Basic Info
  const [portfolioName, setPortfolioName] = useState("Mi Portfolio");
  const [initialCapital, setInitialCapital] = useState<number>(10000);

  // Step 6: Contributions
  const [monthlyContribution, setMonthlyContribution] = useState<number>(1000);
  const [contributionFrequency, setContributionFrequency] = useState<
    "weekly" | "biweekly" | "monthly" | "quarterly"
  >("monthly");
  const [contributionDayOfMonth, setContributionDayOfMonth] = useState(1);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [creationProgress, setCreationProgress] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Persist wizard state across navigation
  const { clear: clearPageState } = usePageState({
    key: 'onboarding',
    snapshot: () => ({
      currentStep,
      selectedRiskProfile,
      selectedStrategy: selectedStrategy ? { id: selectedStrategy.id, name: selectedStrategy.name, config: selectedStrategy.config, description: selectedStrategy.description } : null,
      isCustomPath,
      assets,
      manualWeights,
      weightMethod,
      portfolioName,
      initialCapital,
      monthlyContribution,
      contributionFrequency,
      contributionDayOfMonth,
      leverageMin,
      leverageMax,
      leverageTarget,
      acceptedTerms,
    }),
    restore: (saved) => {
      setCurrentStep(saved.currentStep);
      setSelectedRiskProfile(saved.selectedRiskProfile);
      if (saved.selectedStrategy) setSelectedStrategy(saved.selectedStrategy as PublicStrategySummary);
      setIsCustomPath(saved.isCustomPath);
      if (saved.assets?.length) setAssets(saved.assets);
      if (saved.manualWeights) setManualWeights(saved.manualWeights);
      setWeightMethod(saved.weightMethod);
      setPortfolioName(saved.portfolioName);
      setInitialCapital(saved.initialCapital);
      setMonthlyContribution(saved.monthlyContribution);
      setContributionFrequency(saved.contributionFrequency);
      setContributionDayOfMonth(saved.contributionDayOfMonth);
      setLeverageMin(saved.leverageMin);
      setLeverageMax(saved.leverageMax);
      setLeverageTarget(saved.leverageTarget);
      setAcceptedTerms(saved.acceptedTerms);
    },
    deps: [
      currentStep, selectedRiskProfile, selectedStrategy?.id, isCustomPath,
      assets, manualWeights, weightMethod, portfolioName, initialCapital,
      monthlyContribution, contributionFrequency, contributionDayOfMonth,
      leverageMin, leverageMax, leverageTarget, acceptedTerms,
    ],
  });

  // Dynamic step calculation
  const getSteps = useCallback(() => {
    if (isCustomPath || !selectedStrategy) {
      return ["Riesgo", "Estrategia", "Activos", "Pesos", "Básico", "Aportaciones", "Resumen"];
    }
    return ["Riesgo", "Estrategia", "Básico", "Aportaciones", "Resumen"];
  }, [isCustomPath, selectedStrategy]);

  const steps = getSteps();
  const totalSteps = steps.length;

  // Map logical step to actual step content
  const getStepContent = useCallback(
    (step: number): string => {
      return steps[step - 1] || "";
    },
    [steps]
  );

  // Update leverage values when risk profile changes
  useEffect(() => {
    if (selectedRiskProfile && riskProfiles.length > 0) {
      const profile = riskProfiles.find((p) => p.id === selectedRiskProfile);
      if (profile) {
        setLeverageMin(profile.params.leverageMin);
        setLeverageMax(profile.params.leverageMax);
        setLeverageTarget(profile.params.leverageTarget);
      }
    }
  }, [selectedRiskProfile, riskProfiles]);

  // Load platform strategies when entering step 2 (strategy selection)
  useEffect(() => {
    // Step 2 is always the strategy selection step
    if (currentStep !== 2) return;

    async function loadStrategies() {
      setLoadingStrategies(true);
      try {
        const data = await getPublicStrategies({
          type: "platform",
          riskProfileId: selectedRiskProfile || undefined,
        });
        setPlatformStrategies(data);
      } catch (err) {
        console.error("Failed to load strategies:", err);
      } finally {
        setLoadingStrategies(false);
      }
    }
    loadStrategies();
  }, [currentStep, selectedRiskProfile]);

  // When a strategy is selected, pre-fill assets + weights
  useEffect(() => {
    if (selectedStrategy) {
      const config = selectedStrategy.config;
      const symbols = Object.keys(config.weights);

      // Pre-fill assets
      setAssets(
        symbols.map((symbol) => ({
          symbol,
          name: symbol,
          assetType: "unknown",
        }))
      );

      // Pre-fill weights
      setManualWeights(config.weights);
      setWeightMethod(
        (config.weightMode as "sharpe" | "manual" | "equal") || "manual"
      );
      setIsCustomPath(false);
    }
  }, [selectedStrategy]);

  // Initialize equal weights when assets change (custom path)
  useEffect(() => {
    if (assets.length > 0 && isCustomPath) {
      const equalWeight = 1 / assets.length;
      setManualWeights((prevWeights) => {
        const newWeights: Record<string, number> = {};
        for (const asset of assets) {
          newWeights[asset.symbol] = prevWeights[asset.symbol] ?? equalWeight;
        }
        return newWeights;
      });
    }
  }, [assets, isCustomPath]);

  // Debounced search
  useEffect(() => {
    if (!user || searchQuery.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const abortController = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchSymbols(searchQuery);
        if (abortController.signal.aborted) return;
        const filtered = results.filter(
          (r) => !assets.some((a) => a.symbol === r.symbol)
        );
        setSearchResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error("Search error:", err);
        setSearchResults([]);
        setShowDropdown(false);
      } finally {
        if (!abortController.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
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

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" || e.key === "Enter") {
      if (e.key === "Tab" && !(showDropdown && searchResults.length > 0)) return;
      e.preventDefault();
      if (showDropdown && searchResults.length > 0) {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
        handleAddAsset(searchResults[idx]);
      }
      return;
    }
    if (e.key === "ArrowDown" && showDropdown && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
      return;
    }
    if (e.key === "ArrowUp" && showDropdown && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev <= 0 ? searchResults.length - 1 : prev - 1
      );
      return;
    }
    if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

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
        riskProfile: selectedRiskProfile || undefined,
        leverageMin,
        leverageMax,
        leverageTarget,
        monthlyContribution,
        contributionFrequency,
        contributionDayOfMonth,
        contributionEnabled: true,
      };

      const token = await getToken();
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
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.type === "connected") {
                setCreationProgress(data.message || "Conectado...");
              } else if (data.type === "step") {
                setCreationProgress(data.message || `Paso: ${data.step}`);
              } else if (data.type === "asset") {
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

      if (finalResult?.warnings && finalResult.warnings.length > 0) {
        console.warn("Portfolio created with warnings:", finalResult.warnings);
      }

      if (user?.email) {
        invalidatePortfolioCache(
          finalResult?.portfolio?.id || null,
          user.email
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Set the new portfolio as active and refresh list
      const newPortfolioId = finalResult?.portfolio?.id;
      if (newPortfolioId) {
        refreshPortfolios();
        setActivePortfolioId(newPortfolioId);
      }

      clearPageState();
      router.replace("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear portfolio"
      );
      setIsSubmitting(false);
      setCreationProgress("");
    }
  };

  // Navigation
  const canGoNext = () => {
    const stepLabel = getStepContent(currentStep);
    switch (stepLabel) {
      case "Riesgo":
        return true; // Default selected
      case "Estrategia":
        return selectedStrategy !== null || isCustomPath;
      case "Activos":
        return assets.length >= 1;
      case "Pesos":
        return weightMethod !== "manual" || weightsValid;
      case "Básico":
        return portfolioName.trim() !== "" && initialCapital > 0;
      case "Aportaciones":
        return true;
      case "Resumen":
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

  const handleSelectStrategy = (strategy: PublicStrategySummary) => {
    setSelectedStrategy(strategy);
    setIsCustomPath(false);
  };

  const handleSelectCustom = () => {
    setSelectedStrategy(null);
    setIsCustomPath(true);
    // Reset assets/weights for custom path
    setAssets([]);
    setManualWeights({});
    setWeightMethod("sharpe");
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p style={{ color: "var(--text-muted)" }}>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Determine current step label for rendering
  const currentStepLabel = getStepContent(currentStep);

  return (
    <>
      <Head>
        <title>Configurar Portfolio - Margn</title>
      </Head>
      <div style={containerStyle}>
        {/* Logout button */}
        <button
          onClick={() => signOut()}
          style={{
            position: "absolute",
            top: "1rem",
            right: "1rem",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
            padding: "0.5rem 0.75rem",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            color: "var(--text-dim)",
            fontSize: "0.8rem",
            cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--text-muted)";
            e.currentTarget.style.color = "var(--text-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-dim)";
          }}
        >
          <LogOut size={14} />
          Salir
        </button>
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
              Vamos a configurar los parámetros de cálculo de tu portfolio
            </p>
          </div>

          {/* Progress Bar */}
          <div style={progressContainerStyle}>
            {steps.map((_, idx) => {
              const step = idx + 1;
              return (
                <React.Fragment key={step}>
                  <div
                    style={{
                      ...progressDotStyle,
                      background:
                        step <= currentStep
                          ? "#3b82f6"
                          : "var(--input-border)",
                    }}
                  >
                    {step}
                  </div>
                  {step < totalSteps && (
                    <div
                      style={{
                        ...progressLineStyle,
                        background:
                          step < currentStep
                            ? "#3b82f6"
                            : "var(--input-border)",
                      }}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          <div
            style={{
              fontSize: "0.8rem",
              color: "var(--text-dim)",
              textAlign: "center",
              marginBottom: "1.5rem",
            }}
          >
            {currentStepLabel}
          </div>

          {/* Step Content */}
          <div style={stepContentStyle}>
            {/* ==================== RISK PROFILE ==================== */}
            {currentStepLabel === "Riesgo" && (
              <div>
                <h2 style={stepTitleStyle}>Perfil de Riesgo</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Selecciona un perfil que define los rangos de apalancamiento
                  para los cálculos.
                </p>

                {isLoadingProfiles ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Cargando perfiles...
                  </div>
                ) : (
                  <RiskProfileSelector
                    profiles={riskProfiles}
                    selected={selectedRiskProfile}
                    onSelect={(profileId) => {
                      setSelectedRiskProfile(profileId);
                      // Reset strategy selection when risk profile changes
                      setSelectedStrategy(null);
                      setIsCustomPath(false);
                    }}
                    showCustomOption={true}
                  />
                )}

                {/* Show leverage values if custom is selected */}
                {selectedRiskProfile === null && (
                  <div style={{ ...sectionStyle, marginTop: "1.5rem" }}>
                    <h3
                      style={{
                        ...sectionTitleStyle,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <BarChart size={18} />
                      Apalancamiento Personalizado
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
                )}
              </div>
            )}

            {/* ==================== STRATEGY SELECTION ==================== */}
            {currentStepLabel === "Estrategia" && (
              <div>
                <h2 style={stepTitleStyle}>Elige una Estrategia</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Selecciona una estrategia de la plataforma o crea una configuración
                  personalizada.
                </p>

                {loadingStrategies ? (
                  <div
                    style={{
                      textAlign: "center",
                      padding: "2rem",
                      color: "var(--text-muted)",
                    }}
                  >
                    Cargando estrategias...
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    {platformStrategies.map((strategy) => (
                      <StrategyCard
                        key={strategy.id}
                        strategy={strategy}
                        selected={selectedStrategy?.id === strategy.id}
                        onSelect={() => handleSelectStrategy(strategy)}
                        compact
                        hideRiskBadge
                      />
                    ))}

                    {/* Custom option */}
                    <div
                      onClick={handleSelectCustom}
                      style={{
                        padding: "0.875rem",
                        border: `1px solid ${
                          isCustomPath
                            ? "#8b5cf6"
                            : "var(--border)"
                        }`,
                        borderRadius: "12px",
                        background: isCustomPath
                          ? "rgba(139, 92, 246, 0.08)"
                          : "var(--bg-card)",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                      }}
                    >
                      <div
                        style={{
                          width: "40px",
                          height: "40px",
                          borderRadius: "10px",
                          background: "rgba(139, 92, 246, 0.15)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#a78bfa",
                          flexShrink: 0,
                        }}
                      >
                        <Settings size={20} />
                      </div>
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            fontSize: "0.9375rem",
                          }}
                        >
                          Crear portfolio personalizado
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.8125rem",
                          }}
                        >
                          Elige tus propios activos y asigna pesos manualmente
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== ASSETS (custom only) ==================== */}
            {currentStepLabel === "Activos" && (
              <div>
                <h2 style={stepTitleStyle}>Selecciona tus Activos</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Busca y añade los activos que quieres monitorizar.
                </p>

                {/* Search Input */}
                <div style={{ position: "relative", marginBottom: "1.5rem" }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => {
                      if (searchResults.length > 0) setShowDropdown(true);
                    }}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
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
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setHighlightedIndex(resultIdx)}
                          style={{
                            padding: "0.75rem 1rem",
                            cursor: "pointer",
                            borderBottom:
                              resultIdx < searchResults.length - 1
                                ? "1px solid var(--input-border)"
                                : "none",
                            background:
                              resultIdx === highlightedIndex
                                ? "rgba(59, 130, 246, 0.2)"
                                : "transparent",
                            transition: "background 0.2s",
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
                              style={{
                                fontWeight: "600",
                                color: "var(--text-primary)",
                              }}
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
                                style={{
                                  color: "#22c55e",
                                  fontSize: "0.9rem",
                                }}
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

            {/* ==================== WEIGHTS (custom only) ==================== */}
            {currentStepLabel === "Pesos" && (
              <div>
                <h2 style={stepTitleStyle}>Asignación de Pesos</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Elige cómo asignar los pesos de cálculo entre los activos.
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
                  {(
                    [
                      {
                        key: "sharpe" as const,
                        icon: <TrendingUp size={16} />,
                        title: "Optimización Sharpe",
                        desc: "Los pesos se calculan automáticamente usando optimización Sharpe sobre datos históricos",
                      },
                      {
                        key: "equal" as const,
                        icon: <Scale size={16} />,
                        title: "Pesos Iguales",
                        desc: `Cada activo tendrá el mismo peso (${formatNumberES(
                          100 / assets.length,
                          {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          }
                        )}% cada uno)`,
                      },
                      {
                        key: "manual" as const,
                        icon: <Edit size={16} />,
                        title: "Asignación Manual",
                        desc: "Define manualmente el peso de cada activo",
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.key}
                      style={{
                        ...methodOptionStyle,
                        borderColor:
                          weightMethod === opt.key
                            ? "#3b82f6"
                            : "var(--input-border)",
                        background:
                          weightMethod === opt.key
                            ? "rgba(59, 130, 246, 0.1)"
                            : "transparent",
                      }}
                      onClick={() => setWeightMethod(opt.key)}
                    >
                      <input
                        type="radio"
                        checked={weightMethod === opt.key}
                        onChange={() => setWeightMethod(opt.key)}
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
                          {opt.icon}
                          {opt.title}
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.8rem",
                            marginTop: "0.25rem",
                          }}
                        >
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
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

            {/* ==================== BASIC INFO ==================== */}
            {currentStepLabel === "Básico" && (
              <div>
                <h2 style={stepTitleStyle}>Información Básica</h2>

                <div style={fieldStyle}>
                  <label style={labelStyle}>Nombre del Portfolio</label>
                  <input
                    type="text"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    style={inputStyle}
                    placeholder="Mi Portfolio"
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
                    El capital inicial es el valor de referencia para los
                    cálculos de métricas.
                  </p>
                </div>
              </div>
            )}

            {/* ==================== CONTRIBUTIONS ==================== */}
            {currentStepLabel === "Aportaciones" && (
              <div>
                <h2 style={stepTitleStyle}>Aportaciones Periódicas</h2>
                <p
                  style={{
                    color: "var(--text-muted)",
                    marginBottom: "1.5rem",
                    fontSize: "0.9rem",
                  }}
                >
                  Configura tus aportaciones recurrentes. Puedes ajustar esto
                  después.
                </p>

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
                    Configuración de Aportaciones
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

            {/* ==================== SUMMARY ==================== */}
            {currentStepLabel === "Resumen" && (
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

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "1rem",
                  }}
                >
                  <div style={summaryCardStyle}>
                    <h4 style={summaryLabelStyle}>PORTFOLIO</h4>
                    <p
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: "600",
                        margin: 0,
                      }}
                    >
                      {portfolioName}
                    </p>
                    <p
                      style={{
                        color: "#22c55e",
                        margin: "0.25rem 0 0 0",
                      }}
                    >
                      Capital inicial: {formatCurrencyES(initialCapital)}
                    </p>
                  </div>

                  {selectedStrategy && (
                    <div style={summaryCardStyle}>
                      <h4 style={summaryLabelStyle}>ESTRATEGIA</h4>
                      <p
                        style={{
                          color: "var(--text-primary)",
                          fontWeight: "600",
                          margin: 0,
                        }}
                      >
                        {selectedStrategy.name}
                      </p>
                      {selectedStrategy.description && (
                        <p
                          style={{
                            color: "var(--text-muted)",
                            margin: "0.25rem 0 0 0",
                            fontSize: "0.85rem",
                          }}
                        >
                          {selectedStrategy.description}
                        </p>
                      )}
                    </div>
                  )}

                  <div style={summaryCardStyle}>
                    <h4 style={summaryLabelStyle}>
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
                          {manualWeights[asset.symbol] !== undefined &&
                            weightMethod === "manual" &&
                            `: ${(
                              manualWeights[asset.symbol] * 100
                            ).toFixed(0)}%`}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4 style={summaryLabelStyle}>ASIGNACIÓN DE PESOS</h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {weightMethod === "sharpe" && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <TrendingUp size={16} />
                          Optimización Sharpe (automático)
                        </span>
                      )}
                      {weightMethod === "equal" && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Scale size={16} />
                          Pesos Iguales
                        </span>
                      )}
                      {weightMethod === "manual" && (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                          }}
                        >
                          <Edit size={16} />
                          Asignación Manual
                        </span>
                      )}
                    </p>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4 style={summaryLabelStyle}>PERFIL DE RIESGO</h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {selectedRiskProfile
                        ? riskProfiles.find(
                            (p) => p.id === selectedRiskProfile
                          )?.name || "Moderado"
                        : "Personalizado"}{" "}
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.85rem",
                        }}
                      >
                        ({leverageMin}x - {leverageMax}x)
                      </span>
                    </p>
                  </div>

                  <div style={summaryCardStyle}>
                    <h4 style={summaryLabelStyle}>APORTACIONES</h4>
                    <p style={{ color: "var(--text-primary)", margin: 0 }}>
                      {formatCurrencyES(monthlyContribution)}{" "}
                      {contributionFrequency === "weekly" && "semanales"}
                      {contributionFrequency === "biweekly" && "bisemanales"}
                      {contributionFrequency === "monthly" && "mensuales"}
                      {contributionFrequency === "quarterly" && "trimestrales"}
                    </p>
                  </div>
                </div>

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
                    style={{
                      color: "#60a5fa",
                      margin: 0,
                      fontSize: "0.9rem",
                    }}
                  >
                    Al crear el portfolio, se descargará el histórico de precios
                    de los últimos 24 meses para cada activo. Esto puede tomar
                    unos segundos.
                  </p>
                </div>

                {/* Legal consent checkbox */}
                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    marginTop: "1.25rem",
                    padding: "1rem",
                    background: "rgba(148, 163, 184, 0.06)",
                    borderRadius: "8px",
                    border: "1px solid rgba(148, 163, 184, 0.12)",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    color: "var(--text-muted)",
                    lineHeight: "1.5",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    style={{
                      marginTop: "0.2rem",
                      accentColor: "var(--accent-blue)",
                      width: "16px",
                      height: "16px",
                      flexShrink: 0,
                    }}
                  />
                  <span>
                    Entiendo que Margn es una herramienta de cálculo y
                    visualización, no un asesor financiero. Las simulaciones y
                    métricas son informativas. Acepto los{" "}
                    <a
                      href="/terms"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent-blue)", textDecoration: "underline" }}
                    >
                      Términos y Condiciones
                    </a>.
                  </span>
                </label>
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
                {creationProgress}
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
                <button
                  onClick={handleSubmit}
                  disabled={!acceptedTerms}
                  style={{
                    ...submitButtonStyle,
                    opacity: acceptedTerms ? 1 : 0.5,
                    cursor: acceptedTerms ? "pointer" : "not-allowed",
                  }}
                >
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
  position: "relative",
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
  width: "40px",
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

const summaryLabelStyle: React.CSSProperties = {
  color: "var(--text-muted)",
  margin: "0 0 0.5rem 0",
  fontSize: "0.8rem",
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
