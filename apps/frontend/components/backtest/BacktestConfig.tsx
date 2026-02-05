import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { NumberInput } from '../NumberInput';
import { Tooltip } from '../Tooltip';
import { RiskProfileSelector, type RiskProfileId } from '../RiskProfileSelector';
import { searchSymbols, getRiskProfiles, type SymbolSearchResult, type RiskProfile } from '../../lib/api';
import type { BacktestConfig as BacktestConfigType } from '../../lib/backtest/types';

interface UserDefaults {
  symbols?: string[];
  weights?: Record<string, number>;
  initialCapital?: number;
  monthlyContribution?: number;
  leverageMin?: number;
  leverageMax?: number;
  leverageTarget?: number;
  windowMonths?: number;
  weightMode?: 'sharpe' | 'manual' | 'equal';
  dynamicWeights?: boolean;
  // Source indicator - if from strategy, show a notice
  fromStrategy?: string;
}

interface Props {
  onSubmit: (config: BacktestConfigType) => void;
  loading: boolean;
  userDefaults?: UserDefaults;
}

const FALLBACK_SYMBOLS = ['SPY', 'TLT', 'QQQ', 'GLD', 'BTC-USD', 'SLV', '^STOXX50E'];

const DEFAULT_CONFIG: BacktestConfigType = {
  symbols: FALLBACK_SYMBOLS,
  initialCapital: 60000,
  monthlyContribution: 2000,
  leverageMin: 2.0,
  leverageMax: 3.0,
  leverageTarget: 2.5,
  startDate: '2015-01-01',
  endDate: new Date().toISOString().split('T')[0],
  windowMonths: 60, // 5 years default
  weightMode: 'sharpe',
  dynamicWeights: false,
  dynamicWeightsLookback: 12,
  meanReturnShrinkage: 0.85,
  riskFreeRate: 0.02,
  maintenanceMarginRatio: 0.05,
  maxWeight: 0.3,
  minWeight: 0,
};

// ---------------------------------------------------------------------------
// Label with optional tooltip
// ---------------------------------------------------------------------------
function Label({ text, tooltip }: { text: string; tooltip?: string }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center',
      fontWeight: '500', marginBottom: '0.5rem',
      color: 'var(--text-secondary)', fontSize: '0.875rem',
    }}>
      {text}
      {tooltip && <Tooltip text={tooltip} />}
    </label>
  );
}

// ---------------------------------------------------------------------------
// TOOLTIPS
// ---------------------------------------------------------------------------
const TIPS = {
  capitalInicial:
    'Dinero propio con el que arrancas la simulación. No incluye lo que pide prestado el broker.',
  aportacionMensual:
    'Cantidad que aportas cada mes. La estrategia decide cuánto desplegar según las señales de mercado y cuánto guardar como colchón.',
  leverageMin:
    'Si el apalancamiento baja de este nivel, la estrategia re-pide prestado (reborrow) para volver al objetivo. Valores típicos: 2-3x.',
  leverageTarget:
    'Nivel de apalancamiento al que la estrategia intenta volver cuando rebalancea. Es el punto de equilibrio entre rentabilidad y riesgo.',
  leverageMax:
    'Si el apalancamiento sube de este nivel (porque el mercado cayó y tu equity bajó), las aportaciones se usan para reducir deuda en vez de comprar más. Valores típicos: 3.5-5x.',
  pesoMin:
    'Peso mínimo que cualquier activo puede tener en el portfolio. Evita que el optimizador elimine activos por completo.',
  pesoMax:
    'Peso máximo que cualquier activo puede tener. Evita concentrar demasiado en un solo activo.',
  shrinkage:
    'Controla cuánto "confía" el optimizador en los retornos históricos.\n\n'
    + '- 1.0 = usa los retornos tal cual (agresivo, puede sobreajustar)\n'
    + '- 0.0 = ignora los retornos y solo mira la volatilidad\n'
    + '- 0.6 = reduce los retornos históricos un 40%\n\n'
    + 'Ejemplo: si BTC rindió históricamente un 50% anual, con shrinkage 0.6 el optimizador asume que rendirá un 30%. Esto evita apostar todo a lo que mejor fue en el pasado.',
  fechaInicio:
    'Inicio del período de datos históricos. El backtest creará múltiples ventanas rolling dentro de este rango.',
  fechaFin:
    'Fin del período de datos. Cuanto más largo el rango, más ventanas se simulan y más robusto el resultado.',
  ventana:
    'Duración de cada simulación individual. El backtest genera una ventana nueva cada mes dentro del rango total y luego muestra los percentiles P10/P50/P90.\n\nEjemplo: con rango 2015-2024 y ventana de 5 años, se simulan ~55 ventanas solapadas.',
  weightAuto:
    'Los pesos de cada activo se calculan automáticamente usando el ratio de Sharpe, que maximiza el rendimiento ajustado por riesgo. El sistema analiza el histórico de precios para encontrar la combinación óptima.',
  weightEqual:
    'Reparte el capital en partes iguales entre todos los activos. Simple y sin optimización.',
  weightManual:
    'Tú defines exactamente qué porcentaje va a cada activo.',
  dynamicWeights:
    'Re-optimiza los pesos cada mes usando una ventana rolling de datos recientes. '
    + 'Reduce el riesgo al adaptarse a cambios de mercado, aunque típicamente también reduce la rentabilidad.\n\n'
    + '- Desactivado: calcula los pesos una vez al inicio usando todo el histórico\n'
    + '- Activado: recalcula mensualmente con los últimos N meses',
  dynamicWeightsLookback:
    'Meses de datos históricos para la optimización mensual de pesos. '
    + 'Valores típicos: 6-24 meses.\n\n'
    + '- Menos meses = más reactivo a cambios recientes\n'
    + '- Más meses = más estable pero menos adaptativo',
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function BacktestConfig({ onSubmit, loading, userDefaults }: Props) {
  const [hasAppliedDefaults, setHasAppliedDefaults] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [searchQuery, setSearchQuery] = useState('');

  // Risk profile state
  const [riskProfiles, setRiskProfiles] = useState<RiskProfile[]>([]);
  const [selectedRiskProfile, setSelectedRiskProfile] = useState<RiskProfileId | null>('moderate');
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);

  // Apply user defaults when they arrive (async)
  useEffect(() => {
    if (userDefaults && !hasAppliedDefaults) {
      const userSymbols = userDefaults.symbols && userDefaults.symbols.length > 0
        ? userDefaults.symbols
        : FALLBACK_SYMBOLS;

      setConfig((prev) => ({
        ...prev,
        symbols: userSymbols,
        initialCapital: userDefaults.initialCapital ?? prev.initialCapital,
        monthlyContribution: userDefaults.monthlyContribution ?? prev.monthlyContribution,
        leverageMin: userDefaults.leverageMin ?? prev.leverageMin,
        leverageMax: userDefaults.leverageMax ?? prev.leverageMax,
        leverageTarget: userDefaults.leverageTarget ?? prev.leverageTarget,
        windowMonths: userDefaults.windowMonths ?? prev.windowMonths,
        weightMode: userDefaults.weightMode ?? prev.weightMode,
        dynamicWeights: userDefaults.dynamicWeights ?? prev.dynamicWeights,
        // If manual weights provided, use manual mode
        manualWeights: userDefaults.weights,
      }));
      // If weights provided, set them in manualWeights state
      if (userDefaults.weights) {
        setManualWeights(userDefaults.weights);
      }
      setHasAppliedDefaults(true);
    }
  }, [userDefaults, hasAppliedDefaults]);

  // Load risk profiles on mount
  useEffect(() => {
    async function loadRiskProfiles() {
      try {
        const profiles = await getRiskProfiles();
        setRiskProfiles(profiles);
      } catch (err) {
        console.error('Failed to load risk profiles:', err);
      } finally {
        setIsLoadingProfiles(false);
      }
    }
    loadRiskProfiles();
  }, []);

  // Handle risk profile change
  const handleRiskProfileChange = useCallback((profileId: RiskProfileId | null) => {
    setSelectedRiskProfile(profileId);
    if (profileId && riskProfiles.length > 0) {
      const profile = riskProfiles.find(p => p.id === profileId);
      if (profile) {
        setConfig(prev => ({
          ...prev,
          leverageMin: profile.params.leverageMin,
          leverageMax: profile.params.leverageMax,
          leverageTarget: profile.params.leverageTarget,
          maintenanceMarginRatio: profile.params.maintenanceMarginRatio,
          meanReturnShrinkage: profile.params.meanReturnShrinkage,
          maxWeight: profile.params.maxWeight,
          minWeight: profile.params.minWeight,
          windowMonths: profile.params.windowMonths,
        }));
      }
    }
  }, [riskProfiles]);

  const [searchResults, setSearchResults] = useState<SymbolSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [manualWeights, setManualWeights] = useState<Record<string, number>>({});
  const [showPeriodSettings, setShowPeriodSettings] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const update = (field: string, value: number | string | boolean) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  // Debounced search with abort controller to cancel stale requests
  useEffect(() => {
    if (searchQuery.length < 2) {
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
        const filtered = results.filter((r) => !config.symbols.includes(r.symbol));
        setSearchResults(filtered);
        setShowDropdown(filtered.length > 0);
      } catch {
        if (abortController.signal.aborted) return;
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
  }, [searchQuery, config.symbols]);

  const addSymbol = useCallback((symbol: string) => {
    if (config.symbols.includes(symbol)) return;
    setConfig((prev) => ({ ...prev, symbols: [...prev.symbols, symbol] }));
    setManualWeights((prev) => ({ ...prev, [symbol]: 0 }));
    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [config.symbols]);

  const handleSelectResult = useCallback((result: SymbolSearchResult) => {
    addSymbol(result.symbol);
  }, [addSymbol]);

  const removeSymbol = useCallback((symbol: string) => {
    setConfig((prev) => ({ ...prev, symbols: prev.symbols.filter((s) => s !== symbol) }));
    setManualWeights((prev) => { const n = { ...prev }; delete n[symbol]; return n; });
  }, []);

  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && searchQuery === '' && config.symbols.length > 0) {
      removeSymbol(config.symbols[config.symbols.length - 1]);
      return;
    }
    if (e.key === 'Tab' && searchQuery.trim() !== '') {
      e.preventDefault();
      addSymbol(searchQuery.trim().toUpperCase());
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showDropdown && searchResults.length > 0) {
        const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
        handleSelectResult(searchResults[idx]);
      } else if (searchQuery.trim() !== '') {
        // If no dropdown results, add the raw text as symbol
        addSymbol(searchQuery.trim().toUpperCase());
      }
      return;
    }
    if (e.key === 'ArrowDown' && showDropdown && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % searchResults.length);
      return;
    }
    if (e.key === 'ArrowUp' && showDropdown && searchResults.length > 0) {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev <= 0 ? searchResults.length - 1 : prev - 1));
      return;
    }
    if (e.key === 'Escape') {
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...config,
      manualWeights: config.weightMode === 'manual' ? manualWeights : undefined,
    });
  };

  // Shared styles
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '0.625rem 0.875rem',
    background: 'var(--input-bg)', color: 'var(--input-color)',
    border: '1px solid var(--input-border)', borderRadius: '6px', fontSize: '0.95rem',
  };
  const gridStyle: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem',
  };
  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
    padding: '1.5rem', marginBottom: '1.5rem',
  };
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '1.125rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '1.25rem',
  };

  return (
    <form onSubmit={handleSubmit}>

      {/* ── Notice when loaded from strategy ─────────────────────── */}
      {userDefaults?.fromStrategy && (
        <div style={{
          padding: '1rem',
          marginBottom: '1.5rem',
          background: 'rgba(139, 92, 246, 0.1)',
          border: '1px solid rgba(139, 92, 246, 0.3)',
          borderRadius: '8px',
          color: 'var(--text-secondary)',
          fontSize: '0.875rem',
        }}>
          <strong style={{ color: '#8b5cf6' }}>Configuración cargada de estrategia:</strong>{' '}
          {userDefaults.fromStrategy}
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>
            Puedes modificar los parámetros antes de ejecutar el backtest.
          </p>
        </div>
      )}

      {/* ── Perfil de Riesgo ───────────────────────────────────── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Perfil de Riesgo</h3>
        <div style={{ marginBottom: '0.5rem' }}>
          {isLoadingProfiles ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Cargando perfiles...</div>
          ) : (
            <RiskProfileSelector
              profiles={riskProfiles}
              selected={selectedRiskProfile}
              onSelect={handleRiskProfileChange}
              showCustomOption={true}
              compact={true}
            />
          )}
        </div>
        {/* Show leverage info for the selected profile */}
        {selectedRiskProfile && riskProfiles.length > 0 && (() => {
          const profile = riskProfiles.find(p => p.id === selectedRiskProfile);
          if (!profile) return null;
          return (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'var(--input-bg)',
              borderRadius: '6px',
              border: '1px solid var(--input-border)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Leverage</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.95rem' }}>
                    {profile.params.leverageMin}x – {profile.params.leverageMax}x
                    <span style={{ color: 'var(--text-muted)', fontWeight: '400', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
                      (objetivo: {profile.params.leverageTarget}x)
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Peso Máx.</span>
                  <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.95rem' }}>
                    {(profile.params.maxWeight * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Activos ──────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Activos</h3>
        <div style={{ position: 'relative' }}>
          <Label text="Buscar y agregar tickers" />

          <div
            style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 0.75rem', background: 'var(--input-bg)',
              border: '1px solid var(--input-border)', borderRadius: '6px', cursor: 'text', minHeight: '44px',
            }}
            onClick={() => inputRef.current?.focus()}
          >
            {config.symbols.map((symbol) => (
              <span key={symbol} style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.25rem 0.5rem 0.25rem 0.625rem',
                background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: '4px', color: 'var(--accent-blue-light)', fontSize: '0.8125rem',
                fontWeight: '600', letterSpacing: '0.025em',
              }}>
                {symbol}
                <button type="button" onClick={(e) => { e.stopPropagation(); removeSymbol(symbol); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#64748b'; }}
                ><X size={14} /></button>
              </span>
            ))}
            <input ref={inputRef} type="text" value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
              onBlur={() => { setTimeout(() => setShowDropdown(false), 200); }}
              placeholder={config.symbols.length === 0 ? 'Buscar ticker (ej: SPY, AAPL, BTC-USD)' : 'Buscar...'}
              style={{ flex: 1, minWidth: '120px', background: 'transparent', border: 'none',
                outline: 'none', color: 'var(--input-color)', fontSize: '0.9rem', padding: '0.125rem 0' }}
            />
            {isSearching && <span style={{ color: 'var(--text-dim)', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Buscando...</span>}
          </div>

          {showDropdown && searchResults.length > 0 && (
            <div ref={dropdownRef} style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: 'var(--border)', border: '1px solid var(--input-border)', borderRadius: '8px',
              marginTop: '0.25rem', maxHeight: '300px', overflowY: 'auto', zIndex: 1000,
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}>
              {searchResults.map((result, idx) => (
                <div key={`${result.symbol}-${idx}`}
                  onClick={() => handleSelectResult(result)}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  style={{ padding: '0.75rem 1rem', cursor: 'pointer',
                    borderBottom: idx < searchResults.length - 1 ? '1px solid var(--input-border)' : 'none',
                    background: idx === highlightedIndex ? 'rgba(59,130,246,0.2)' : 'transparent', transition: 'background 0.15s' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.95rem' }}>{result.symbol}</div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginTop: '0.125rem' }}>{result.name}</div>
                      {result.exchange && <div style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.125rem' }}>{result.exchange}</div>}
                    </div>
                    {result.price !== null && (
                      <div style={{ color: '#22c55e', fontWeight: '600', fontSize: '0.95rem' }}>${result.price.toFixed(2)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p style={{ color: 'var(--text-dim)', fontSize: '0.75rem', marginTop: '0.35rem' }}>
            {config.symbols.length} activo{config.symbols.length !== 1 ? 's' : ''} seleccionado{config.symbols.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Pesos ────────────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Pesos</h3>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {([
            { mode: 'sharpe' as const, label: 'Automático', tip: TIPS.weightAuto },
            { mode: 'equal' as const, label: 'Iguales', tip: TIPS.weightEqual },
            { mode: 'manual' as const, label: 'Manual', tip: TIPS.weightManual },
          ]).map(({ mode, label, tip }) => (
            <label key={mode} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1rem', flex: 1, cursor: 'pointer', minWidth: '140px',
              background: config.weightMode === mode ? 'rgba(59,130,246,0.2)' : 'var(--input-bg)',
              border: config.weightMode === mode ? '1px solid #3b82f6' : '1px solid var(--input-border)',
              borderRadius: '8px',
            }}>
              <input type="radio" name="weightMode" checked={config.weightMode === mode}
                onChange={() => update('weightMode', mode)} style={{ accentColor: '#3b82f6' }} />
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.875rem' }}>{label}</span>
              <Tooltip text={tip} />
            </label>
          ))}
        </div>

        {config.weightMode === 'manual' && config.symbols.length > 0 && (
          <div>
            {config.symbols.map((symbol) => (
              <div key={symbol} style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600', minWidth: '80px' }}>{symbol}</span>
                <input type="range" min={0} max={100}
                  value={(manualWeights[symbol] || 0) * 100}
                  onChange={(e) => setManualWeights((prev) => ({ ...prev, [symbol]: parseFloat(e.target.value) / 100 }))}
                  style={{ flex: 1, accentColor: '#3b82f6' }} />
                <span style={{ color: 'var(--text-muted)', minWidth: '50px', textAlign: 'right' }}>
                  {((manualWeights[symbol] || 0) * 100).toFixed(1)}%
                </span>
              </div>
            ))}
            {/* Total row */}
            {(() => {
              const total = Object.values(manualWeights).reduce((sum, w) => sum + (w || 0), 0) * 100;
              const isValid = Math.abs(total - 100) < 0.1;
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '1rem',
                  marginTop: '0.75rem', paddingTop: '0.75rem',
                  borderTop: '1px solid var(--input-border)',
                }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: '600', minWidth: '80px' }}>Total</span>
                  <div style={{ flex: 1 }} />
                  <span style={{
                    minWidth: '50px', textAlign: 'right', fontWeight: '700',
                    color: isValid ? '#22c55e' : '#f59e0b',
                  }}>
                    {total.toFixed(1)}%
                  </span>
                </div>
              );
            })()}
            {(() => {
              const total = Object.values(manualWeights).reduce((sum, w) => sum + (w || 0), 0) * 100;
              if (Math.abs(total - 100) >= 0.1) {
                return (
                  <p style={{ color: '#f59e0b', fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Los pesos deben sumar 100% para un backtest preciso
                  </p>
                );
              }
              return null;
            })()}
          </div>
        )}

        {/* Optimization params - visible when auto weights is selected */}
        {config.weightMode === 'sharpe' && (
          <>
            {/* Dynamic weights toggle */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              marginBottom: '1rem', cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={config.dynamicWeights || false}
                onChange={(e) => update('dynamicWeights', e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: '#3b82f6' }}
              />
              <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                Re-optimizar pesos mensualmente
              </span>
              <Tooltip text={TIPS.dynamicWeights} />
            </label>

            {config.dynamicWeights && (
              <div style={{ marginBottom: '1rem' }}>
                <Label text="Lookback (meses)" tooltip={TIPS.dynamicWeightsLookback} />
                <NumberInput value={config.dynamicWeightsLookback || 12} onChange={(v) => update('dynamicWeightsLookback', v)}
                  min={3} max={36} step={1} decimals={0} style={{ ...inputStyle, maxWidth: '200px' }} />
              </div>
            )}

            {/* Advanced optimization params - only visible with custom profile */}
            {selectedRiskProfile === null && (
              <div style={gridStyle}>
                <div>
                  <Label text="Peso Mín. (%)" tooltip={TIPS.pesoMin} />
                  <NumberInput value={config.minWeight * 100} onChange={(v) => update('minWeight', v / 100)}
                    min={0} max={50} step={1} decimals={0} style={inputStyle} />
                </div>
                <div>
                  <Label text="Peso Máx. (%)" tooltip={TIPS.pesoMax} />
                  <NumberInput value={config.maxWeight * 100} onChange={(v) => update('maxWeight', v / 100)}
                    min={10} max={100} step={5} decimals={0} style={inputStyle} />
                </div>
                <div>
                  <Label text="Shrinkage de retornos" tooltip={TIPS.shrinkage} />
                  <NumberInput value={config.meanReturnShrinkage} onChange={(v) => update('meanReturnShrinkage', v)}
                    min={0} max={1} step={0.1} decimals={1} style={inputStyle} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Capital y Aportación ───────────────────────────────────── */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Capital y Aportación</h3>
        <div style={gridStyle}>
          <div>
            <Label text="Capital Inicial (USD)" tooltip={TIPS.capitalInicial} />
            <NumberInput value={config.initialCapital} onChange={(v) => update('initialCapital', v)}
              min={1000} step={1000} decimals={0} style={inputStyle} />
          </div>
          <div>
            <Label text="Aportación Mensual (USD)" tooltip={TIPS.aportacionMensual} />
            <NumberInput value={config.monthlyContribution} onChange={(v) => update('monthlyContribution', v)}
              min={0} step={100} decimals={0} style={inputStyle} />
          </div>
        </div>
      </div>

      {/* ── Leverage (solo con perfil personalizado) ───────────────────────────────────── */}
      {selectedRiskProfile === null && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Leverage</h3>
          <div style={gridStyle}>
            <div>
              <Label text="Leverage Mín." tooltip={TIPS.leverageMin} />
              <NumberInput value={config.leverageMin} onChange={(v) => update('leverageMin', v)}
                min={1} max={10} step={0.1} decimals={1} style={inputStyle} />
            </div>
            <div>
              <Label text="Leverage Objetivo" tooltip={TIPS.leverageTarget} />
              <NumberInput value={config.leverageTarget} onChange={(v) => update('leverageTarget', v)}
                min={1} max={10} step={0.1} decimals={1} style={inputStyle} />
            </div>
            <div>
              <Label text="Leverage Máx." tooltip={TIPS.leverageMax} />
              <NumberInput value={config.leverageMax} onChange={(v) => update('leverageMax', v)}
                min={1} max={10} step={0.1} decimals={1} style={inputStyle} />
            </div>
          </div>
        </div>
      )}

      {/* ── Periodo y Ventanas (siempre visible, colapsable) ─────────────────────────── */}
      <div style={sectionStyle}>
        <button
          type="button"
          onClick={() => setShowPeriodSettings(!showPeriodSettings)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            width: '100%',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {showPeriodSettings ? (
            <ChevronDown size={18} style={{ color: 'var(--text-muted)' }} />
          ) : (
            <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
          )}
          <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>Periodo y Ventanas</h3>
          {!showPeriodSettings && (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: 'auto' }}>
              {config.startDate} – {config.endDate} · {config.windowMonths / 12} años
            </span>
          )}
        </button>
        {showPeriodSettings && (
          <div style={{ marginTop: '1.25rem' }}>
            <div style={gridStyle}>
              <div>
                <Label text="Fecha Inicio" tooltip={TIPS.fechaInicio} />
                <input type="date" value={config.startDate}
                  onChange={(e) => update('startDate', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <Label text="Fecha Fin" tooltip={TIPS.fechaFin} />
                <input type="date" value={config.endDate}
                  onChange={(e) => update('endDate', e.target.value)} style={inputStyle} />
              </div>
              <div>
                <Label text="Duración Ventana" tooltip={TIPS.ventana} />
                <select value={config.windowMonths}
                  onChange={(e) => update('windowMonths', parseInt(e.target.value))} style={inputStyle}>
                  <option value={36}>3 años (36 meses)</option>
                  <option value={48}>4 años (48 meses)</option>
                  <option value={60}>5 años (60 meses)</option>
                  <option value={72}>6 años (72 meses)</option>
                  <option value={84}>7 años (84 meses)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {(() => {
        const manualWeightsTotal = Object.values(manualWeights).reduce((sum, w) => sum + (w || 0), 0) * 100;
        const manualWeightsInvalid = config.weightMode === 'manual' && Math.abs(manualWeightsTotal - 100) >= 0.1;
        const isDisabled = loading || config.symbols.length === 0 || manualWeightsInvalid;

        return (
          <button type="submit" disabled={isDisabled}
            style={{
              width: '100%', padding: '1rem',
              background: isDisabled ? 'var(--disabled-bg)' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: isDisabled ? 'var(--disabled-color)' : 'white',
              border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: '600',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}>
            {loading ? 'Cargando precios...' : manualWeightsInvalid ? 'Ajusta los pesos a 100%' : 'Ejecutar Backtest'}
          </button>
        );
      })()}
    </form>
  );
}
