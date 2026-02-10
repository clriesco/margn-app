import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { useAuth, useUser } from '@clerk/nextjs';
import DashboardSidebar from '../../../components/DashboardSidebar';
import CreatePortfolioModal from '../../../components/strategies/CreatePortfolioModal';
import StrategyAIAnalysis from '../../../components/StrategyAIAnalysis';
import { scoreColor } from '../../../lib/backtest/scoring';
import { formatNumberES } from '../../../lib/number-format';
import { usePortfolio } from '../../../contexts/PortfolioContext';
import { updateStrategyVisibility } from '../../../lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

interface TrajectoryPoint {
  date: string;
  equity: number;
}

interface ScenarioMetrics {
  startDate: string;
  endDate: string;
  finalCapital: number;
  totalContributed: number;
  returnPercent: number;
  cagr: number;
  xirr?: number | null;
  sharpe: number;
  maxDrawdownEquity: number;
  recoveryDays: number;
  underwaterDays: number;
  finalLeverage: number;
}

interface StrategyDetail {
  id: string;
  name: string;
  createdAt: string;
  isPublic?: boolean;
  isPlatform?: boolean;
  riskProfileId?: string | null;
  description?: string | null;
  aiAnalysis?: string | null;
  isOwner?: boolean;
  config: {
    symbols: string[];
    weights: Record<string, number>;
    initialCapital: number;
    monthlyContribution: number;
    leverageMin: number;
    leverageMax: number;
    leverageTarget: number;
    windowMonths: number;
    weightMode?: string; // 'sharpe' | 'manual' | 'equal'
    dynamicWeights?: boolean; // Re-optimize weights monthly (only for sharpe mode)
  };
  metrics: {
    p10: ScenarioMetrics;
    p50: ScenarioMetrics;
    p90: ScenarioMetrics;
    totalWindows: number;
    marginCallCount: number;
    score?: {
      composite: number;
      dimensions: { dispersion: number; worstCase: number; sharpe: number; drawdown: number };
      marginCallPenalty?: boolean;
    };
  } | null;
  trajectories: {
    p10: { points: TrajectoryPoint[] };
    p50: { points: TrajectoryPoint[] };
    p90: { points: TrajectoryPoint[] };
  } | null;
}

// SVG Chart component for trajectories
// Each scenario (P10/P50/P90) comes from different rolling windows with different dates
// We normalize by progress (0-100%) so each trajectory fills the chart width
// If a trajectory ended early (margin call), it stops at that point
function TrajectoriesChart({ trajectories, config, height = 300 }: {
  trajectories: NonNullable<StrategyDetail['trajectories']>;
  config: StrategyDetail['config'];
  height?: number;
}) {
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const width = 800;

  // Get all data points for Y-axis bounds
  const allPoints = [
    ...trajectories.p10.points,
    ...trajectories.p50.points,
    ...trajectories.p90.points,
  ];

  if (allPoints.length === 0) {
    return <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>No hay datos de trayectoria</div>;
  }

  // Calculate Y bounds
  const equities = allPoints.map((p) => p.equity);
  const minEquity = Math.min(...equities);
  const maxEquity = Math.max(...equities);

  // Find the longest trajectory to determine max duration
  const maxPoints = Math.max(
    trajectories.p10.points.length,
    trajectories.p50.points.length,
    trajectories.p90.points.length
  );

  // Calculate total invested line (initial capital + cumulative contributions)
  // Assume ~21 trading days per month
  const approxMonths = Math.round(maxPoints / 21);
  const totalInvestedAtEnd = config.initialCapital + (config.monthlyContribution * approxMonths);

  // Extend Y bounds to include total invested line
  const yMin = Math.min(minEquity, config.initialCapital);
  const yMax = Math.max(maxEquity, totalInvestedAtEnd);
  const equityRange = yMax - yMin || 1;

  // Check which trajectories ended early (margin call)
  const p10MarginCall = trajectories.p10.points.length < maxPoints && trajectories.p10.points.length > 0;
  const p50MarginCall = trajectories.p50.points.length < maxPoints && trajectories.p50.points.length > 0;
  const hasMarginCalls = p10MarginCall || p50MarginCall;

  // Y scale (equity to pixel)
  const yScale = (equity: number) => {
    const normalized = (equity - yMin) / equityRange;
    return height - padding.bottom - normalized * (height - padding.top - padding.bottom);
  };

  // X scale (progress 0-1 to pixel)
  const xScale = (progress: number) => {
    return padding.left + progress * (width - padding.left - padding.right);
  };

  // Generate path for a trajectory using normalized progress
  const generatePath = (points: TrajectoryPoint[]) => {
    if (points.length === 0) return '';
    return points
      .map((p, i) => {
        const progress = points.length > 1 ? i / (maxPoints - 1) : 0;
        return `${i === 0 ? 'M' : 'L'} ${xScale(progress).toFixed(1)} ${yScale(p.equity).toFixed(1)}`;
      })
      .join(' ');
  };

  // Generate path for total invested (dashed line showing contributions)
  const generateInvestedPath = () => {
    const points: string[] = [];
    // Create points at each month boundary
    for (let month = 0; month <= approxMonths; month++) {
      const invested = config.initialCapital + (config.monthlyContribution * month);
      const progress = approxMonths > 0 ? month / approxMonths : 0;
      points.push(`${month === 0 ? 'M' : 'L'} ${xScale(progress).toFixed(1)} ${yScale(invested).toFixed(1)}`);
    }
    return points.join(' ');
  };

  // Format currency for axis
  const formatAxis = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  // Y-axis ticks
  const yTicks = 5;
  const yTickValues = Array.from({ length: yTicks }, (_, i) => yMin + (equityRange * i) / (yTicks - 1));

  // X-axis labels
  const xLabels = [
    { pos: 0, label: 'Mes 0' },
    { pos: 0.5, label: `Mes ${Math.round(approxMonths / 2)}` },
    { pos: 1, label: `Mes ${approxMonths}` },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <svg viewBox={`0 0 ${width} ${height}`} style={{ flex: 1, height: 'auto', maxHeight: `${height}px` }}>
        {/* Grid lines */}
        {yTickValues.map((v) => (
          <line
            key={v}
            x1={padding.left}
            y1={yScale(v)}
            x2={width - padding.right}
            y2={yScale(v)}
            stroke="var(--border)"
            strokeDasharray="4"
          />
        ))}

        {/* Y-axis labels */}
        {yTickValues.map((v) => (
          <text
            key={v}
            x={padding.left - 8}
            y={yScale(v)}
            textAnchor="end"
            dominantBaseline="middle"
            fill="var(--text-muted)"
            fontSize="11"
          >
            {formatAxis(v)}
          </text>
        ))}

        {/* X-axis labels (progress-based) */}
        {xLabels.map(({ pos, label }) => (
          <text
            key={label}
            x={xScale(pos)}
            y={height - 8}
            textAnchor={pos === 0 ? 'start' : pos === 1 ? 'end' : 'middle'}
            fill="var(--text-muted)"
            fontSize="11"
          >
            {label}
          </text>
        ))}

        {/* Total invested line (dashed) */}
        <path
          d={generateInvestedPath()}
          fill="none"
          stroke="var(--text-secondary)"
          strokeWidth="1.5"
          strokeDasharray="6,4"
          opacity="0.6"
        />

        {/* P10 line (worst) */}
        <path
          d={generatePath(trajectories.p10.points)}
          fill="none"
          stroke="#f87171"
          strokeWidth="2"
          opacity="0.8"
        />

        {/* P50 line (median) */}
        <path
          d={generatePath(trajectories.p50.points)}
          fill="none"
          stroke="#60a5fa"
          strokeWidth="2.5"
        />

        {/* P90 line (best) */}
        <path
          d={generatePath(trajectories.p90.points)}
          fill="none"
          stroke="#34d399"
          strokeWidth="2"
          opacity="0.8"
        />

        {/* Margin call markers (if trajectory ended early) */}
        {p10MarginCall && (
          <circle
            cx={xScale((trajectories.p10.points.length - 1) / (maxPoints - 1))}
            cy={yScale(trajectories.p10.points[trajectories.p10.points.length - 1].equity)}
            r="5"
            fill="#f87171"
            stroke="var(--bg-card)"
            strokeWidth="2"
          />
        )}
        {p50MarginCall && (
          <circle
            cx={xScale((trajectories.p50.points.length - 1) / (maxPoints - 1))}
            cy={yScale(trajectories.p50.points[trajectories.p50.points.length - 1].equity)}
            r="5"
            fill="#60a5fa"
            stroke="var(--bg-card)"
            strokeWidth="2"
          />
        )}
      </svg>

      {/* Legend - outside the chart */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.5rem',
        minWidth: '90px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '2px', background: '#34d399' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>P90</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '2.5px', background: '#60a5fa' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>P50</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '20px', height: '2px', background: '#f87171' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>P10</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
          <div style={{ width: '20px', height: '1.5px', background: 'var(--text-secondary)', opacity: 0.6, borderTop: '1.5px dashed var(--text-secondary)' }} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Invertido</span>
        </div>
        {hasMarginCalls && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--text-muted)',
            }} />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.6875rem' }}>Margin call</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StrategyDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user } = useUser();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function loadData() {
      if (!id || !user) return;

      const token = await getToken();
      if (!token) return;

      try {
        // Load strategy
        const response = await fetch(`${API_BASE_URL}/strategies/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status === 404) throw new Error('Estrategia no encontrada');
          throw new Error('Error loading strategy');
        }

        const data = await response.json();
        setStrategy(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user, getToken]);

  const handleDelete = useCallback(async () => {
    if (!strategy) return;

    setDeleting(true);

    const token = await getToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategy.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error deleting');

      const tab = router.query.tab;
      router.push(`/dashboard/strategies${tab ? `?tab=${tab}` : ''}`);
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [strategy, router, getToken]);

  const startEditingName = useCallback(() => {
    if (!strategy) return;
    setEditedName(strategy.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, [strategy]);

  const cancelEditingName = useCallback(() => {
    setEditingName(false);
    setEditedName('');
  }, []);

  const saveEditedName = useCallback(async () => {
    if (!strategy || !editedName.trim()) return;

    const token = await getToken();
    if (!token) return;

    setSavingName(true);
    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editedName.trim() }),
      });

      if (!response.ok) throw new Error('Error saving name');

      setStrategy((prev) => prev ? { ...prev, name: editedName.trim() } : null);
      setEditingName(false);
    } catch {
      // Keep editing mode open on error
    } finally {
      setSavingName(false);
    }
  }, [strategy, editedName, getToken]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditedName();
    } else if (e.key === 'Escape') {
      cancelEditingName();
    }
  }, [saveEditedName, cancelEditingName]);

  const startEditingDescription = useCallback(() => {
    if (!strategy) return;
    setEditedDescription(strategy.description || '');
    setEditingDescription(true);
    setTimeout(() => descriptionInputRef.current?.focus(), 0);
  }, [strategy]);

  const cancelEditingDescription = useCallback(() => {
    setEditingDescription(false);
    setEditedDescription('');
  }, []);

  const saveEditedDescription = useCallback(async () => {
    if (!strategy) return;

    const token = await getToken();
    if (!token) return;

    setSavingDescription(true);
    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description: editedDescription.trim() }),
      });

      if (!response.ok) throw new Error('Error saving description');

      setStrategy((prev) => prev ? { ...prev, description: editedDescription.trim() || null } : null);
      setEditingDescription(false);
    } catch {
      // Keep editing mode open on error
    } finally {
      setSavingDescription(false);
    }
  }, [strategy, editedDescription, getToken]);

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      saveEditedDescription();
    } else if (e.key === 'Escape') {
      cancelEditingDescription();
    }
  }, [saveEditedDescription, cancelEditingDescription]);

  const handleNewBacktest = useCallback(() => {
    if (!strategy) return;

    // Store config in localStorage and redirect to backtest page
    const backtestConfig = {
      strategyName: strategy.name,
      symbols: strategy.config.symbols,
      weights: strategy.config.weights,
      initialCapital: strategy.config.initialCapital,
      monthlyContribution: strategy.config.monthlyContribution,
      leverageMin: strategy.config.leverageMin,
      leverageMax: strategy.config.leverageMax,
      leverageTarget: strategy.config.leverageTarget,
      windowMonths: strategy.config.windowMonths,
      weightMode: strategy.config.weightMode || 'manual',
      dynamicWeights: strategy.config.dynamicWeights || false,
    };

    localStorage.setItem('backtest_from_strategy', JSON.stringify(backtestConfig));
    router.push('/dashboard/backtest');
  }, [strategy, router]);

  const handleToggleVisibility = useCallback(async () => {
    if (!strategy) return;
    setTogglingVisibility(true);
    try {
      await updateStrategyVisibility(strategy.id, !strategy.isPublic);
      setStrategy((prev) => prev ? { ...prev, isPublic: !prev.isPublic } : null);
    } catch { /* ignore */ } finally {
      setTogglingVisibility(false);
    }
  }, [strategy]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';
  const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });

  if (!authLoaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{strategy?.name || 'Estrategia'} | Estrategias</title>
        <style dangerouslySetInnerHTML={{ __html: `
          .editable-row .edit-pencil { opacity: 0; transition: opacity 0.15s ease; }
          .editable-row:hover .edit-pencil { opacity: 1; }
          @media (max-width: 768px) {
            .strategy-detail-wrapper { padding: 1rem !important; padding-top: 4rem !important; }
            .strategy-config-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .strategy-metrics-table { font-size: 0.75rem !important; }
          }
        `}} />
      </Head>
      <DashboardSidebar>
        <div style={{ padding: '2rem', paddingTop: '4rem' }} className="strategy-detail-wrapper">
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            {loading ? (
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '3rem',
                textAlign: 'center',
              }}>
                <p style={{ color: 'var(--text-muted)' }}>Cargando estrategia...</p>
              </div>
            ) : error || !strategy ? (
              <>
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '1rem',
                  color: '#ef4444',
                  marginBottom: '1rem',
                }}>
                  {error || 'Estrategia no encontrada'}
                </div>
                <Link href={`/dashboard/strategies${router.query.tab ? `?tab=${router.query.tab}` : ''}`} style={{ color: 'var(--text-secondary)' }}>
                  ← Volver a estrategias
                </Link>
              </>
            ) : (
              <>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <Link href={`/dashboard/strategies${router.query.tab ? `?tab=${router.query.tab}` : ''}`} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
                    ← Volver a estrategias
                  </Link>
                </div>

                <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <div className="editable-row" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                    {editingName ? (
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={handleNameKeyDown}
                        onBlur={saveEditedName}
                        disabled={savingName}
                        style={{
                          fontSize: '1.875rem',
                          fontWeight: '700',
                          color: 'var(--text-primary)',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--accent)',
                          borderRadius: '4px',
                          padding: '0.125rem 0.5rem',
                          outline: 'none',
                          width: '100%',
                          maxWidth: '500px',
                        }}
                      />
                    ) : (
                      <>
                        <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>
                          {strategy.name}
                        </h1>
                        {strategy.isOwner !== false && (
                          <button
                            className="edit-pencil"
                            onClick={startEditingName}
                            title="Editar nombre"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0.25rem',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.125rem' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>
                      Creada: {formatDate(strategy.createdAt)}
                    </p>
                    {strategy.isOwner !== false && (
                      <button
                        onClick={handleToggleVisibility}
                        disabled={togglingVisibility}
                        style={{
                          padding: '0.1875rem 0.625rem',
                          background: strategy.isPublic ? 'rgba(16, 185, 129, 0.1)' : 'var(--hover-bg)',
                          border: `1px solid ${strategy.isPublic ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
                          borderRadius: '20px',
                          fontSize: '0.75rem',
                          color: strategy.isPublic ? '#10b981' : 'var(--text-muted)',
                          cursor: togglingVisibility ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {strategy.isPublic ? 'Pública' : 'Privada'}
                      </button>
                    )}
                  </div>
                  {editingDescription ? (
                    <div style={{ marginTop: '0.25rem' }}>
                      <textarea
                        ref={descriptionInputRef}
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        onKeyDown={handleDescriptionKeyDown}
                        onBlur={saveEditedDescription}
                        disabled={savingDescription}
                        placeholder="Añadir descripción..."
                        rows={2}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          background: 'var(--bg-card)',
                          border: '1px solid var(--accent)',
                          borderRadius: '4px',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          outline: 'none',
                        }}
                      />
                    </div>
                  ) : (strategy.description || strategy.isOwner !== false) ? (
                    <div className="editable-row" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.25rem' }}>
                      <p style={{ color: strategy.description ? 'var(--text-secondary)' : 'var(--text-dim)', fontSize: '0.875rem', margin: 0, fontStyle: strategy.description ? 'normal' : 'italic' }}>
                        {strategy.description || 'Sin descripción'}
                      </p>
                      {strategy.isOwner !== false && (
                        <button
                          className="edit-pencil"
                          onClick={startEditingDescription}
                          title="Editar descripción"
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.25rem',
                            color: 'var(--text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>

                {/* Config */}
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Configuración
                  </h3>
                  <div className="strategy-config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Capital inicial</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{fmtUsd(strategy.config.initialCapital)}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Contribución</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{fmtUsd(strategy.config.monthlyContribution)}/mes</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Leverage</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{strategy.config.leverageTarget}x ({strategy.config.leverageMin}x - {strategy.config.leverageMax}x)</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Modo de pesos</div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: '500' }}>
                        {strategy.config.weightMode === 'sharpe'
                          ? (strategy.config.dynamicWeights ? 'Sharpe (re-optimización mensual)' : 'Sharpe (pesos fijos)')
                          : strategy.config.weightMode === 'equal' ? 'Pesos iguales' : 'Pesos manuales'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Pesos</div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {Object.entries(strategy.config.weights).map(([symbol, weight]) => (
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

                {/* Trajectories Chart */}
                {strategy.trajectories && (
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Trayectorias P10 / P50 / P90
                  </h3>
                  <TrajectoriesChart trajectories={strategy.trajectories} config={strategy.config} />
                </div>
                )}

                {/* Metrics */}
                {strategy.metrics && (
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Métricas ({strategy.metrics.totalWindows} ventanas, {strategy.metrics.marginCallCount} margin calls)
                  </h3>

                  {/* Score breakdown */}
                  {strategy.metrics.score && (
                    <div style={{
                      display: 'flex', gap: '1.5rem', alignItems: 'center',
                      padding: '1rem', marginBottom: '1rem',
                      background: 'var(--hover-bg)', borderRadius: '8px',
                      flexWrap: 'wrap',
                    }}>
                      <div style={{ textAlign: 'center', minWidth: '72px' }}>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: scoreColor(strategy.metrics.score.composite), lineHeight: 1 }}>
                          {Math.round(strategy.metrics.score.composite)}
                        </div>
                        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Score</div>
                        {strategy.metrics.score.marginCallPenalty && (
                          <div style={{ fontSize: '0.625rem', color: '#f87171', marginTop: '0.125rem' }}>margin call</div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {([
                          ['Consistencia', strategy.metrics.score.dimensions.dispersion],
                          ['Riesgo/Retorno', strategy.metrics.score.dimensions.worstCase],
                          ['Sharpe', strategy.metrics.score.dimensions.sharpe],
                          ['Drawdown', strategy.metrics.score.dimensions.drawdown],
                        ] as const).map(([label, value]) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ width: '100px', fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                            <div style={{ flex: 1, height: '8px', background: 'var(--bg-glass)', borderRadius: '4px', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(value, 2)}%`, height: '100%', background: scoreColor(value), borderRadius: '4px' }} />
                            </div>
                            <span style={{ width: '32px', textAlign: 'right', fontSize: '0.75rem', fontWeight: '600', color: scoreColor(value) }}>
                              {Math.round(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ overflowX: 'auto' }}>
                    <table className="strategy-metrics-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Métrica</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>P10</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>P50</th>
                          <th style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>P90</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const m = strategy.metrics;
                          const green = (v: number) => v >= 0 ? '#34d399' : '#f87171';
                          const red = (v: number) => v <= 0 ? '#f87171' : '#34d399';
                          const neutral = () => 'var(--text-secondary)';
                          const cell = (v: string, color: string, idx: number) => (
                            <td key={idx} style={{ padding: '0.75rem 1rem', textAlign: 'right', color, borderBottom: '1px solid var(--border)' }}>{v}</td>
                          );
                          const row = (label: string, vals: [string, string, string], colorFn: (v: number) => string, rawVals: [number, number, number], rowIdx: number) => (
                            <tr key={label} className="table-row-hoverable" style={{ background: rowIdx % 2 === 1 ? 'var(--hover-bg)' : 'transparent', transition: 'background 0.15s ease' }}>
                              <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{label}</td>
                              {vals.map((v, i) => cell(v, colorFn(rawVals[i]), i))}
                            </tr>
                          );
                          const fmtDays = (v: number) => `${v} días`;
                          const fmtNum = (v: number) => v.toFixed(2);
                          const fmtXirr = (v: number | null | undefined) => v != null ? fmtPct(v) : '—';
                          const xirrColor = (v: number | null | undefined) => v != null ? green(v) : 'var(--text-muted)';

                          return (<>
                            {row('Capital Final', [fmtUsd(m.p10.finalCapital), fmtUsd(m.p50.finalCapital), fmtUsd(m.p90.finalCapital)], green, [m.p10.finalCapital, m.p50.finalCapital, m.p90.finalCapital], 0)}
                            {row('Capital Aportado', [fmtUsd(strategy.config.initialCapital + m.p10.totalContributed), fmtUsd(strategy.config.initialCapital + m.p50.totalContributed), fmtUsd(strategy.config.initialCapital + m.p90.totalContributed)], neutral, [0, 0, 0], 1)}
                            {row('Retorno %', [fmtPct(m.p10.returnPercent), fmtPct(m.p50.returnPercent), fmtPct(m.p90.returnPercent)], green, [m.p10.returnPercent, m.p50.returnPercent, m.p90.returnPercent], 2)}
                            {row('CAGR', [fmtPct(m.p10.cagr), fmtPct(m.p50.cagr), fmtPct(m.p90.cagr)], green, [m.p10.cagr, m.p50.cagr, m.p90.cagr], 3)}
                            {(() => {
                              const xirrVals: [string, string, string] = [fmtXirr(m.p10.xirr), fmtXirr(m.p50.xirr), fmtXirr(m.p90.xirr)];
                              const xirrRaw: [number, number, number] = [m.p10.xirr ?? 0, m.p50.xirr ?? 0, m.p90.xirr ?? 0];
                              return (
                                <tr className="table-row-hoverable" style={{ background: 4 % 2 === 1 ? 'var(--hover-bg)' : 'transparent', transition: 'background 0.15s ease' }}>
                                  <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>XIRR</td>
                                  {xirrVals.map((v, i) => (
                                    <td key={i} style={{ padding: '0.75rem 1rem', textAlign: 'right', color: xirrColor(xirrRaw[i] != null ? xirrRaw[i] : null), borderBottom: '1px solid var(--border)' }}>{v}</td>
                                  ))}
                                </tr>
                              );
                            })()}
                            {row('Sharpe', [fmtNum(m.p10.sharpe), fmtNum(m.p50.sharpe), fmtNum(m.p90.sharpe)], neutral, [0, 0, 0], 5)}
                            {row('Max Drawdown', [fmtPct(m.p10.maxDrawdownEquity), fmtPct(m.p50.maxDrawdownEquity), fmtPct(m.p90.maxDrawdownEquity)], red, [m.p10.maxDrawdownEquity, m.p50.maxDrawdownEquity, m.p90.maxDrawdownEquity], 6)}
                            {row('Recovery (días)', [fmtDays(m.p10.recoveryDays), fmtDays(m.p50.recoveryDays), fmtDays(m.p90.recoveryDays)], neutral, [0, 0, 0], 7)}
                            {row('Días bajo el agua', [fmtDays(m.p10.underwaterDays), fmtDays(m.p50.underwaterDays), fmtDays(m.p90.underwaterDays)], neutral, [0, 0, 0], 8)}
                            {row('Leverage Final', [fmtNum(m.p10.finalLeverage), fmtNum(m.p50.finalLeverage), fmtNum(m.p90.finalLeverage)], neutral, [0, 0, 0], 9)}
                          </>);
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}

                {/* AI Analysis */}
                {strategy.metrics && (
                  <StrategyAIAnalysis
                    strategyId={strategy.id}
                    existingAnalysis={strategy.aiAnalysis || null}
                    isOwner={strategy.isOwner !== false}
                  />
                )}

                {/* Actions section */}
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Acciones
                  </h3>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    Crea un nuevo portfolio con los activos, pesos y configuracion de leverage de esta estrategia.
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {strategy.metrics && (
                    <button
                      onClick={handleNewBacktest}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.6 2.6" />
                        <path d="M21 3v6h-6" />
                      </svg>
                      Nuevo backtest
                    </button>
                    )}

                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                      }}
                    >
                      Crear portfolio
                    </button>
                  </div>
                </div>

                {showCreateModal && strategy && (
                  <CreatePortfolioModal
                    strategyId={strategy.id}
                    strategyName={strategy.name}
                    defaultContribution={strategy.config.monthlyContribution}
                    onClose={() => setShowCreateModal(false)}
                  />
                )}

                {/* Delete — only for owner */}
                {strategy.isOwner !== false && (
                <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: 'transparent',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    Eliminar estrategia
                  </button>
                </div>
                )}

                {/* Delete confirmation modal */}
                {showDeleteConfirm && (
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
                    onClick={() => setShowDeleteConfirm(false)}
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
                        ¿Estás seguro de que quieres eliminar &quot;{strategy.name}&quot;? Esta acción no se puede deshacer.
                      </p>
                      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
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
                          onClick={handleDelete}
                          disabled={deleting}
                          style={{
                            padding: '0.625rem 1rem',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: deleting ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {deleting ? 'Eliminando...' : 'Eliminar'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
