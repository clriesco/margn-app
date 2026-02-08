import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import DashboardSidebar from '../../../components/DashboardSidebar';
import { StrategyCard } from '../../../components/StrategyCard';
import {
  getPortfoliosByEmail,
  getPublicStrategies,
  updateStrategyVisibility,
  fetchAPI,
  type PublicStrategySummary,
} from '../../../lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

type TabId = 'mine' | 'platform' | 'community';

const RISK_FILTERS = [
  { id: '', label: 'Todos' },
  { id: 'conservative', label: 'Conservador' },
  { id: 'moderate', label: 'Moderado' },
  { id: 'growth', label: 'Crecimiento' },
  { id: 'aggressive', label: 'Agresivo' },
];

const RISK_PROFILE_ORDER: Record<string, number> = {
  conservative: 0,
  moderate: 1,
  growth: 2,
  aggressive: 3,
};

function sortByRiskProfile(strategies: PublicStrategySummary[]): PublicStrategySummary[] {
  return [...strategies].sort((a, b) => {
    const orderA = a.riskProfileId ? RISK_PROFILE_ORDER[a.riskProfileId] ?? 99 : 99;
    const orderB = b.riskProfileId ? RISK_PROFILE_ORDER[b.riskProfileId] ?? 99 : 99;
    if (orderA !== orderB) return orderA - orderB;
    // Score descending (higher first)
    const scoreA = a.metrics?.score?.composite ?? -1;
    const scoreB = b.metrics?.score?.composite ?? -1;
    if (scoreA !== scoreB) return scoreB - scoreA;
    // Name ascending
    return a.name.localeCompare(b.name);
  });
}

export default function StrategiesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const initialTab = (router.query.tab as string) || 'mine';
  const [activeTab, setActiveTab] = useState<TabId>(
    ['mine', 'platform', 'community'].includes(initialTab) ? initialTab as TabId : 'mine'
  );

  // Sync tab from URL when query changes (e.g., browser back)
  useEffect(() => {
    const tab = router.query.tab as string;
    if (tab && ['mine', 'platform', 'community'].includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, [router.query.tab]);

  // My strategies state
  const [myStrategies, setMyStrategies] = useState<PublicStrategySummary[]>([]);
  const [myLoading, setMyLoading] = useState(true);
  const [myError, setMyError] = useState('');

  // Public strategies state
  const [publicStrategies, setPublicStrategies] = useState<PublicStrategySummary[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicError, setPublicError] = useState('');
  const [riskFilter, setRiskFilter] = useState('');

  // Actions state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [togglingVisibility, setTogglingVisibility] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // Load my strategies
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
        setMyStrategies(data);
      } catch (err) {
        setMyError(err instanceof Error ? err.message : 'Error');
      } finally {
        setMyLoading(false);
      }
    }
    if (user) loadStrategies();
  }, [user]);

  // Load public strategies when switching to platform/community tab
  useEffect(() => {
    if (activeTab === 'mine') return;
    const type = activeTab === 'platform' ? 'platform' : 'community';

    async function load() {
      setPublicLoading(true);
      setPublicError('');
      try {
        const data = await getPublicStrategies({
          type,
          riskProfileId: riskFilter || undefined,
        });
        setPublicStrategies(data);
      } catch (err) {
        setPublicError(err instanceof Error ? err.message : 'Error');
      } finally {
        setPublicLoading(false);
      }
    }
    load();
  }, [activeTab, riskFilter]);

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
      setMyStrategies((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
      setDeleteConfirm(null);
    } catch { /* ignore */ } finally {
      setDeletingId(null);
    }
  }, [deleteConfirm]);

  const handleToggleVisibility = useCallback(async (strategyId: string, currentPublic: boolean) => {
    setTogglingVisibility(strategyId);
    try {
      await updateStrategyVisibility(strategyId, !currentPublic);
      setMyStrategies((prev) =>
        prev.map((s) => (s.id === strategyId ? { ...s, isPublic: !currentPublic } : s))
      );
    } catch { /* ignore */ } finally {
      setTogglingVisibility(null);
    }
  }, []);

  const handleApply = useCallback(async (strategyId: string) => {
    if (!portfolioId) return;
    setApplyingId(strategyId);
    setApplyResult(null);

    try {
      const result = await fetchAPI(`/strategies/${strategyId}/apply/${portfolioId}`, {
        method: 'POST',
      });
      setApplyResult({ success: true, message: result.message });
      setTimeout(() => router.push('/dashboard/rebalance'), 2000);
    } catch (err) {
      setApplyResult({ success: false, message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setApplyingId(null);
    }
  }, [portfolioId, router]);

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
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                Estrategias
              </h1>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Gestiona tus estrategias y explora las de la plataforma y comunidad
              </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
              {([
                { id: 'mine' as TabId, label: 'Mis Estrategias' },
                { id: 'platform' as TabId, label: 'Plataforma' },
                { id: 'community' as TabId, label: 'Comunidad' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => { setActiveTab(tab.id); setRiskFilter(''); router.replace({ query: { ...router.query, tab: tab.id } }, undefined, { shallow: true }); }}
                  style={{
                    padding: '0.75rem 1.25rem',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                    color: activeTab === tab.id ? '#3b82f6' : 'var(--text-muted)',
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    fontSize: '0.9375rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Apply result notification */}
            {applyResult && (
              <div style={{
                padding: '0.75rem 1rem',
                background: applyResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${applyResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                borderRadius: '8px',
                color: applyResult.success ? '#10b981' : '#ef4444',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {applyResult.message}
              </div>
            )}

            {/* ============ TAB: Mis Estrategias ============ */}
            {activeTab === 'mine' && (
              <>
                {myLoading && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Cargando estrategias...</p>
                  </div>
                )}

                {myError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '1rem', color: '#ef4444', marginBottom: '1.5rem' }}>
                    {myError}
                  </div>
                )}

                {!myLoading && !myError && myStrategies.length === 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
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

                {!myLoading && myStrategies.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                    {myStrategies.map((strategy) => (
                      <StrategyCard
                        key={strategy.id}
                        strategy={strategy}
                        href={`/dashboard/strategies/${strategy.id}?tab=mine`}
                        isPublic={!!strategy.isPublic}
                        onToggleVisibility={() => handleToggleVisibility(strategy.id, !!strategy.isPublic)}
                        isTogglingVisibility={togglingVisibility === strategy.id}
                        onDelete={() => setDeleteConfirm({ id: strategy.id, name: strategy.name })}
                        isDeleting={deletingId === strategy.id}
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ============ TAB: Platform / Community ============ */}
            {(activeTab === 'platform' || activeTab === 'community') && (
              <>
                {/* Risk profile filter */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                  {RISK_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setRiskFilter(f.id)}
                      style={{
                        padding: '0.375rem 0.875rem',
                        background: riskFilter === f.id ? 'rgba(59, 130, 246, 0.15)' : 'var(--hover-bg)',
                        border: `1px solid ${riskFilter === f.id ? 'rgba(59, 130, 246, 0.4)' : 'var(--border)'}`,
                        borderRadius: '20px',
                        color: riskFilter === f.id ? '#3b82f6' : 'var(--text-muted)',
                        fontSize: '0.8125rem',
                        fontWeight: riskFilter === f.id ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {publicLoading && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)' }}>Cargando estrategias...</p>
                  </div>
                )}

                {publicError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '1rem', color: '#ef4444', marginBottom: '1.5rem' }}>
                    {publicError}
                  </div>
                )}

                {!publicLoading && !publicError && publicStrategies.length === 0 && (
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                      {activeTab === 'platform' ? '📊' : '👥'}
                    </div>
                    <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem 0' }}>
                      {activeTab === 'platform'
                        ? 'No hay estrategias de plataforma'
                        : 'No hay estrategias de la comunidad'}
                    </h3>
                    <p style={{ color: 'var(--text-muted)' }}>
                      {activeTab === 'community'
                        ? 'Las estrategias públicas de otros usuarios aparecerán aquí.'
                        : 'Contacta al administrador.'}
                    </p>
                  </div>
                )}

                {!publicLoading && publicStrategies.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
                    {sortByRiskProfile(publicStrategies).map((strategy) => (
                      <StrategyCard
                        key={strategy.id}
                        strategy={strategy}
                        href={`/dashboard/strategies/${strategy.id}?tab=${activeTab}`}
                        onApply={portfolioId ? () => handleApply(strategy.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </>
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
