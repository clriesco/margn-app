import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import DashboardSidebar from '../../../components/DashboardSidebar';
import { formatNumberES } from '../../../lib/number-format';
import { getPortfoliosByEmail } from '../../../lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

interface ScenarioMetricsSummary {
  finalCapital: number;
  cagr: number;
  sharpe: number;
  maxDrawdownEquity: number;
}

interface StrategySummary {
  id: string;
  name: string;
  createdAt: string;
  config: {
    symbols: string[];
    weights: Record<string, number>;
    leverageTarget: number;
    weightMode?: string;
    dynamicWeights?: boolean;
  };
  metrics: {
    p10: ScenarioMetricsSummary;
    p50: ScenarioMetricsSummary;
    p90: ScenarioMetricsSummary;
    totalWindows: number;
    marginCallCount: number;
  };
}

export default function StrategiesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Load portfolioId
  useEffect(() => {
    async function loadPortfolio() {
      let pId = router.query.portfolioId as string;
      if (!pId && user?.email) {
        try {
          const portfolios = await getPortfoliosByEmail(user.email);
          if (portfolios?.length > 0) pId = portfolios[0].id;
        } catch { /* ignore */ }
      }
      if (pId) setPortfolioId(pId);
    }
    if (!authLoading && user) loadPortfolio();
  }, [user, authLoading, router.query.portfolioId]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    async function loadStrategies() {
      const token = localStorage.getItem('supabase_token');
      if (!token) return;

      try {
        const response = await fetch(`${API_BASE_URL}/strategies`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error('Error loading strategies');

        const data = await response.json();
        setStrategies(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    }

    if (user) loadStrategies();
  }, [user]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;

    setDeletingId(deleteConfirm.id);
    const token = localStorage.getItem('supabase_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error deleting');

      setStrategies((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch {
      // Ignore errors
    } finally {
      setDeletingId(null);
    }
  }, [deleteConfirm]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';
  const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });

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
        <title>Estrategias | Leveraged DCA</title>
        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .strategies-wrapper { padding: 1rem !important; padding-top: 4rem !important; }
            .strategies-metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}} />
      </Head>
      <DashboardSidebar portfolioId={portfolioId}>
        <div style={{ padding: '2rem', paddingTop: '4rem' }} className="strategies-wrapper">
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Estrategias guardadas
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Backtests guardados que puedes aplicar a tu portfolio
              </p>
            </div>

            {loading && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-muted)' }}>Cargando estrategias...</p>
              </div>
            )}

            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                padding: '1rem',
                color: '#ef4444',
                marginBottom: '1.5rem',
              }}>
                {error}
              </div>
            )}

            {!loading && !error && strategies.length === 0 && (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📈</div>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
                  Sin estrategias guardadas
                </h3>
                <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                  Ejecuta un backtest y guárdalo como estrategia para verlo aquí.
                </p>
                <Link
                  href="/dashboard/backtest"
                  style={{
                    display: 'inline-block',
                    padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
                    color: 'white',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    fontWeight: '500',
                  }}
                >
                  Ir a Backtest
                </Link>
              </div>
            )}

            {!loading && strategies.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {strategies.map((strategy) => (
                  <div
                    key={strategy.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      padding: '1.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <Link
                          href={`/dashboard/strategies/${strategy.id}`}
                          style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.0625rem', fontWeight: '600', textDecoration: 'none' }}
                        >
                          {strategy.name}
                        </Link>
                        <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0 0', fontSize: '0.8125rem' }}>
                          {formatDate(strategy.createdAt)}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{
                          padding: '0.25rem 0.75rem',
                          background: 'var(--hover-bg)',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}>
                          {strategy.config.leverageTarget}x
                        </div>
                        <div style={{
                          padding: '0.25rem 0.75rem',
                          background: 'var(--hover-bg)',
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}>
                          {strategy.config.weightMode === 'sharpe'
                            ? (strategy.config.dynamicWeights ? 'Sharpe dinámico' : 'Sharpe')
                            : strategy.config.weightMode === 'equal' ? 'Iguales' : 'Manual'}
                        </div>
                      </div>
                    </div>

                    {/* Weights */}
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                      {Object.entries(strategy.config.weights).map(([symbol, weight]) => (
                        <span
                          key={symbol}
                          style={{
                            padding: '0.25rem 0.5rem',
                            background: 'var(--hover-bg)',
                            border: '1px solid var(--border-light)',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          {symbol}: {(weight * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>

                    {/* Metrics table */}
                    <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: '500' }}></th>
                            <th style={{ padding: '0.5rem', textAlign: 'right', color: '#f87171', borderBottom: '1px solid var(--border)', fontWeight: '500' }}>P10</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right', color: '#60a5fa', borderBottom: '1px solid var(--border)', fontWeight: '500' }}>P50</th>
                            <th style={{ padding: '0.5rem', textAlign: 'right', color: '#34d399', borderBottom: '1px solid var(--border)', fontWeight: '500' }}>P90</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '0.375rem 0.5rem', color: 'var(--text-muted)' }}>Capital</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500' }}>{fmtUsd(strategy.metrics.p10.finalCapital)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500' }}>{fmtUsd(strategy.metrics.p50.finalCapital)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500' }}>{fmtUsd(strategy.metrics.p90.finalCapital)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '0.375rem 0.5rem', color: 'var(--text-muted)' }}>CAGR</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: strategy.metrics.p10.cagr >= 0 ? '#34d399' : '#f87171' }}>{fmtPct(strategy.metrics.p10.cagr)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: strategy.metrics.p50.cagr >= 0 ? '#34d399' : '#f87171' }}>{fmtPct(strategy.metrics.p50.cagr)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: strategy.metrics.p90.cagr >= 0 ? '#34d399' : '#f87171' }}>{fmtPct(strategy.metrics.p90.cagr)}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '0.375rem 0.5rem', color: 'var(--text-muted)' }}>Max DD</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#f87171' }}>{fmtPct(strategy.metrics.p10.maxDrawdownEquity)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#f87171' }}>{fmtPct(strategy.metrics.p50.maxDrawdownEquity)}</td>
                            <td style={{ padding: '0.375rem 0.5rem', textAlign: 'right', color: '#f87171' }}>{fmtPct(strategy.metrics.p90.maxDrawdownEquity)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Link
                        href={`/dashboard/strategies/${strategy.id}`}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'transparent',
                          color: 'var(--text-secondary)',
                          border: '1px solid var(--border)',
                          borderRadius: '6px',
                          textDecoration: 'none',
                          fontSize: '0.875rem',
                        }}
                      >
                        Ver detalle
                      </Link>
                      <button
                        onClick={() => setDeleteConfirm({ id: strategy.id, name: strategy.name })}
                        disabled={deletingId === strategy.id}
                        style={{
                          padding: '0.375rem 0.75rem',
                          background: 'transparent',
                          color: deletingId === strategy.id ? 'var(--text-muted)' : '#ef4444',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          borderRadius: '6px',
                          cursor: deletingId === strategy.id ? 'not-allowed' : 'pointer',
                          fontSize: '0.8125rem',
                        }}
                      >
                        {deletingId === strategy.id ? 'Eliminando...' : 'Eliminar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation modal */}
        {deleteConfirm && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setDeleteConfirm(null)}
          >
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '1.5rem',
                maxWidth: '400px',
                margin: '1rem',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0' }}>Eliminar estrategia</h3>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                ¿Estás seguro de que quieres eliminar &quot;{deleteConfirm.name}&quot;? Esta acción no se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  style={{
                    padding: '0.625rem 1rem',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deletingId === deleteConfirm.id}
                  style={{
                    padding: '0.625rem 1rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: deletingId === deleteConfirm.id ? 'not-allowed' : 'pointer',
                  }}
                >
                  {deletingId === deleteConfirm.id ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </DashboardSidebar>
    </>
  );
}
