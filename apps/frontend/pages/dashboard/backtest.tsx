import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../contexts/AuthContext';
import { usePortfolio } from '../../contexts/PortfolioContext';
import { getBacktestPrices, getPortfolioSummary, getPortfolioConfiguration } from '../../lib/api';
import DashboardSidebar from '../../components/DashboardSidebar';
import { LegalDisclaimer } from '../../components/LegalDisclaimer';
import BacktestConfigForm from '../../components/backtest/BacktestConfig';
import BacktestExplanation, { BacktestExplanationHandle } from '../../components/backtest/BacktestExplanation';
import BacktestProgress from '../../components/backtest/BacktestProgress';
import BacktestResults from '../../components/backtest/BacktestResults';
import SaveStrategyButton from '../../components/backtest/SaveStrategyButton';
import TrajectoryChart from '../../components/backtest/TrajectoryChart';
import { computeBacktestScore } from '../../lib/backtest/scoring';
import { formatNumberES } from '../../lib/number-format';
import type {
  BacktestConfig,
  BacktestProgress as ProgressType,
  BacktestResult,
  WorkerResponse,
} from '../../lib/backtest/types';

type Stage = 'config' | 'loading-prices' | 'running' | 'results';

export default function BacktestPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const [stage, setStage] = useState<Stage>('config');
  const [progress, setProgress] = useState<ProgressType | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [dateWarning, setDateWarning] = useState('');
  const [downloadProgress, setDownloadProgress] = useState<{ current: string; done: string[]; total: number }>({ current: '', done: [], total: 0 });
  const [userDefaults, setUserDefaults] = useState<{
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
    fromStrategy?: string;
  } | undefined>(undefined);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [priceExcludedSymbols, setPriceExcludedSymbols] = useState<string[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const explanationRef = useRef<BacktestExplanationHandle>(null);

  // Load portfolio ID and user defaults (or from strategy if redirected)
  useEffect(() => {
    async function load() {
      // Check if we have strategy config in localStorage (from strategy detail page)
      const strategyConfigStr = localStorage.getItem('backtest_from_strategy');
      if (strategyConfigStr) {
        try {
          const strategyConfig = JSON.parse(strategyConfigStr);
          localStorage.removeItem('backtest_from_strategy'); // Clear after reading

          setUserDefaults({
            symbols: strategyConfig.symbols,
            weights: strategyConfig.weights,
            initialCapital: strategyConfig.initialCapital,
            monthlyContribution: strategyConfig.monthlyContribution,
            leverageMin: strategyConfig.leverageMin,
            leverageMax: strategyConfig.leverageMax,
            leverageTarget: strategyConfig.leverageTarget,
            windowMonths: strategyConfig.windowMonths,
            weightMode: strategyConfig.weightMode,
            dynamicWeights: strategyConfig.dynamicWeights,
            fromStrategy: strategyConfig.strategyName,
          });
          setDefaultsLoaded(true);
          return; // Don't load portfolio defaults if we have strategy config
        } catch { /* ignore parse errors */ }
      }

      // Normal flow: load from portfolio
      if (!portfolioId) return;

      // Load user's portfolio data for defaults
      try {
        const [summary, config] = await Promise.all([
          getPortfolioSummary(portfolioId),
          getPortfolioConfiguration(portfolioId),
        ]);
        // Extract symbols from user's positions
        const userSymbols = summary.positions
          ?.map((p: { asset: { symbol: string } }) => p.asset.symbol)
          .filter(Boolean) || [];

        setUserDefaults({
          symbols: userSymbols.length > 0 ? userSymbols : undefined,
          initialCapital: config.initialCapital,
          monthlyContribution: config.monthlyContribution ?? undefined,
          leverageMin: config.leverageMin,
          leverageMax: config.leverageMax,
          leverageTarget: config.leverageTarget,
        });
      } catch { /* ignore - will use defaults */ }
      setDefaultsLoaded(true);
    }
    if (!authLoading && user) load();
  }, [user, authLoading, portfolioId]);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  const handleCancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStage('config');
    setProgress(null);
  }, []);

  const handleSubmit = useCallback(async (config: BacktestConfig) => {
    setError('');
    setDateWarning('');
    setPriceExcludedSymbols([]);
    setStage('loading-prices');

    try {
      // 1. Fetch prices per symbol so user can see progress
      const allPrices: Record<string, Record<string, number>> = {};
      const firstDates: string[] = [];
      const symbolsWithoutPrices: string[] = [];
      setDownloadProgress({ current: '', done: [], total: config.symbols.length });

      for (let i = 0; i < config.symbols.length; i++) {
        const symbol = config.symbols[i];
        setDownloadProgress({ current: symbol, done: config.symbols.slice(0, i), total: config.symbols.length });

        const { prices: symbolPrices, earliestCommonDate: ecd } = await getBacktestPrices(
          [symbol], config.startDate, config.endDate
        );

        if (!symbolPrices[symbol] || Object.keys(symbolPrices[symbol]).length === 0) {
          // No prices found - exclude this symbol but continue
          symbolsWithoutPrices.push(symbol);
          continue;
        }

        allPrices[symbol] = symbolPrices[symbol];
        firstDates.push(ecd);
      }

      // Check if we have at least one symbol with prices
      const symbolsWithPrices = config.symbols.filter(s => !symbolsWithoutPrices.includes(s));
      if (symbolsWithPrices.length === 0) {
        throw new Error('Ningún activo tiene datos de precios. Verifica que los tickers son correctos.');
      }

      // Update config to only include symbols with prices
      config.symbols = symbolsWithPrices;
      setPriceExcludedSymbols(symbolsWithoutPrices);

      setDownloadProgress({ current: '', done: config.symbols, total: config.symbols.length });

      const prices = allPrices;
      const earliestCommonDate = firstDates.sort().pop() || config.startDate;


      // 2. Start Web Worker
      setStage('running');

      const worker = new Worker(
        new URL('../../lib/backtest/worker.ts', import.meta.url)
      );
      workerRef.current = worker;

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const msg = event.data;
        if (msg.type === 'progress') {
          setProgress(msg.progress!);
        } else if (msg.type === 'result') {
          // Combine price-excluded symbols with backtest-excluded symbols
          const backResult = msg.result!;
          const allExcluded = [
            ...symbolsWithoutPrices,
            ...(backResult.excludedSymbols || []),
          ];
          if (allExcluded.length > 0) {
            backResult.excludedSymbols = allExcluded;
          }
          backResult.score = computeBacktestScore({
            p10: { cagr: backResult.p10.cagr, sharpe: backResult.p10.sharpe, maxDrawdown: backResult.p10.maxDrawdownEquity },
            p50: { cagr: backResult.p50.cagr, sharpe: backResult.p50.sharpe },
            p90: { cagr: backResult.p90.cagr, sharpe: backResult.p90.sharpe, maxDrawdown: backResult.p90.maxDrawdownEquity },
            marginCallCount: backResult.marginCallCount,
          });
          setResult(backResult);
          setStage('results');
          worker.terminate();
          workerRef.current = null;
        } else if (msg.type === 'error') {
          setError(msg.error || 'Error desconocido en el backtest');
          setStage('config');
          worker.terminate();
          workerRef.current = null;
        }
      };

      worker.onerror = (e) => {
        const errorMsg = e.message || e.error?.message || 'Error desconocido al cargar el worker';
        console.error('Worker error:', e);
        setError(`Error del worker: ${errorMsg}`);
        setStage('config');
        worker.terminate();
        workerRef.current = null;
      };

      worker.postMessage({ type: 'start', config, prices });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar precios');
      setStage('config');
    }
  }, []);

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    router.push('/');
    return null;
  }

  return (
    <>
      <Head>
        <title>Backtest - Margn</title>
        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .backtest-wrapper { padding: 1rem !important; padding-top: 4rem !important; }
          }
        `}} />
      </Head>
      <DashboardSidebar>
        <div style={{ padding: '2rem', paddingTop: '4rem' }} className="backtest-wrapper">
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Backtest Historico
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Simula la estrategia DCA apalancada con datos historicos reales
              </p>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <LegalDisclaimer text="El backtest es una simulación histórica con fines educativos. Los resultados pasados no garantizan rendimientos futuros. No constituye asesoramiento financiero." />
            </div>

            {/* Date warning */}
            {dateWarning && (
              <div style={{
                marginBottom: '1.5rem', padding: '1rem',
                background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px',
                fontSize: '0.875rem',
              }}>
                {dateWarning}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                marginBottom: '1.5rem', padding: '1rem',
                background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px',
                whiteSpace: 'pre-wrap', fontSize: '0.875rem',
              }}>
                {error}
              </div>
            )}

            {/* State machine */}
            {stage === 'config' && !defaultsLoaded && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                Cargando configuración...
              </div>
            )}
            {stage === 'config' && defaultsLoaded && (
              <BacktestConfigForm onSubmit={handleSubmit} loading={false} userDefaults={userDefaults} />
            )}

            {stage === 'loading-prices' && (
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                padding: '2rem',
              }}>
                <h3 style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.125rem', marginBottom: '1.25rem' }}>
                  Descargando precios historicos...
                </h3>

                {/* Progress bar */}
                <div style={{
                  width: '100%', height: '8px', background: 'var(--bg-glass)',
                  borderRadius: '4px', overflow: 'hidden', marginBottom: '1rem',
                }}>
                  <div style={{
                    width: `${downloadProgress.total > 0 ? (downloadProgress.done.length / downloadProgress.total) * 100 : 0}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.25rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <span>{downloadProgress.done.length} de {downloadProgress.total} tickers</span>
                  <span>{downloadProgress.total > 0 ? Math.round((downloadProgress.done.length / downloadProgress.total) * 100) : 0}%</span>
                </div>

                {/* Per-symbol status */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {downloadProgress.done.map((symbol) => (
                    <span key={symbol} style={{
                      padding: '0.25rem 0.625rem',
                      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                      borderRadius: '4px', color: '#34d399', fontSize: '0.8125rem', fontWeight: '600',
                    }}>
                      {symbol}
                    </span>
                  ))}
                  {downloadProgress.current && (
                    <span style={{
                      padding: '0.25rem 0.625rem',
                      background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)',
                      borderRadius: '4px', color: '#60a5fa', fontSize: '0.8125rem', fontWeight: '600',
                    }}>
                      {downloadProgress.current}...
                    </span>
                  )}
                </div>

                <p style={{ color: 'var(--text-dim)', fontSize: '0.8125rem', marginTop: '1rem' }}>
                  La primera descarga de un ticker puede tardar mas. Las siguientes usan cache.
                </p>
              </div>
            )}

            {stage === 'running' && progress && (
              <BacktestProgress progress={progress} onCancel={handleCancel} />
            )}

            {stage === 'results' && result && (
              <>
                {/* Config parameters */}
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                  padding: '1.25rem', marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Configuración
                  </h3>
                  <div className="backtest-config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Capital inicial</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{'$' + formatNumberES(result.config.initialCapital, { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Contribución</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{'$' + formatNumberES(result.config.monthlyContribution, { maximumFractionDigits: 0 })}/mes</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Leverage</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{result.config.leverageTarget}x ({result.config.leverageMin}x - {result.config.leverageMax}x)</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Modo de pesos</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {result.config.weightMode === 'sharpe'
                          ? (result.config.dynamicWeights ? 'Sharpe (re-optimización mensual)' : 'Sharpe (pesos fijos)')
                          : result.config.weightMode === 'equal' ? 'Pesos iguales' : 'Pesos manuales'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Pesos</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(result.weightsUsed).map(([symbol, weight]) => (
                        <span key={symbol} style={{
                          padding: '0.375rem 0.75rem',
                          background: 'var(--hover-bg)',
                          border: '1px solid var(--border-light)',
                          borderRadius: '20px',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary)',
                        }}>
                          {symbol}: {(weight * 100).toFixed(1)}%
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <TrajectoryChart result={result} />
                <BacktestResults result={result} />

                {/* AI Explanation (after results - component handles idle/active states) */}
                <BacktestExplanation ref={explanationRef} result={result} />

                {/* Actions Bar */}
                <div
                  className="backtest-actions-bar"
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                    marginTop: '1.5rem',
                    padding: '1rem 1.25rem',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                  }}
                >
                  <SaveStrategyButton result={result} />

                  <button
                    onClick={() => {
                      const configToReuse = {
                        strategyName: 'Backtest anterior',
                        symbols: result.config.symbols,
                        weights: result.weightsUsed,
                        initialCapital: result.config.initialCapital,
                        monthlyContribution: result.config.monthlyContribution,
                        leverageMin: result.config.leverageMin,
                        leverageMax: result.config.leverageMax,
                        leverageTarget: result.config.leverageTarget,
                        windowMonths: result.config.windowMonths,
                        weightMode: result.config.weightMode || 'sharpe',
                        dynamicWeights: result.config.dynamicWeights || false,
                      };
                      localStorage.setItem('backtest_from_strategy', JSON.stringify(configToReuse));
                      window.location.reload();
                    }}
                    className="backtest-action-btn"
                    style={{
                      padding: '0.625rem 1rem',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.6 2.6" />
                      <path d="M21 3v6h-6" />
                    </svg>
                    Repetir con misma config
                  </button>

                  <button
                    onClick={() => { setStage('config'); setResult(null); setProgress(null); }}
                    className="backtest-action-btn"
                    style={{
                      padding: '0.625rem 1rem',
                      background: 'var(--bg-card)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Nueva simulación
                  </button>
                </div>

                <style jsx global>{`
                  @media (max-width: 768px) {
                    .backtest-actions-bar {
                      flex-direction: column !important;
                    }
                    .backtest-actions-bar > button,
                    .backtest-action-btn {
                      width: 100% !important;
                      justify-content: center !important;
                    }
                  }
                `}</style>
              </>
            )}
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
