import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';
import DashboardSidebar from '../../../components/DashboardSidebar';
import { formatNumberES } from '../../../lib/number-format';
import { getPortfoliosByEmail } from '../../../lib/api';

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
  };
  trajectories: {
    p10: { points: TrajectoryPoint[] };
    p50: { points: TrajectoryPoint[] };
    p90: { points: TrajectoryPoint[] };
  };
}

// SVG Chart component for trajectories
// Each scenario (P10/P50/P90) comes from different rolling windows with different dates
// We normalize by progress (0-100%) so each trajectory fills the chart width
// If a trajectory ended early (margin call), it stops at that point
function TrajectoriesChart({ trajectories, config, height = 300 }: {
  trajectories: StrategyDetail['trajectories'];
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
  const { user, loading: authLoading } = useAuth();
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    async function loadData() {
      if (!id || !user) return;

      const token = localStorage.getItem('supabase_token');
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

        // Load portfolio ID
        if (user.email) {
          const portfolios = await getPortfoliosByEmail(user.email);
          if (portfolios?.length > 0) {
            setPortfolioId(portfolios[0].id);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id, user]);

  const handleApply = useCallback(async () => {
    if (!portfolioId || !strategy) return;

    setApplying(true);
    setApplyResult(null);

    const token = localStorage.getItem('supabase_token');
    if (!token) {
      setApplyResult({ success: false, message: 'No autenticado' });
      setApplying(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategy.id}/apply/${portfolioId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Error applying strategy');
      }

      setApplyResult({ success: true, message: data.message });

      // Redirect to rebalance after 2 seconds
      setTimeout(() => {
        router.push('/dashboard/rebalance');
      }, 2000);
    } catch (err) {
      setApplyResult({ success: false, message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setApplying(false);
    }
  }, [portfolioId, strategy, router]);

  const handleDelete = useCallback(async () => {
    if (!strategy) return;

    setDeleting(true);

    const token = localStorage.getItem('supabase_token');
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategy.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error deleting');

      router.push('/dashboard/strategies');
    } catch {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [strategy, router]);

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
        <title>{strategy?.name || 'Estrategia'} | Estrategias</title>
        <style dangerouslySetInnerHTML={{ __html: `
          @media (max-width: 768px) {
            .strategy-detail-wrapper { padding: 1rem !important; padding-top: 4rem !important; }
            .strategy-config-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .strategy-metrics-table { font-size: 0.75rem !important; }
          }
        `}} />
      </Head>
      <DashboardSidebar portfolioId={portfolioId}>
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
                <Link href="/dashboard/strategies" style={{ color: 'var(--text-secondary)' }}>
                  ← Volver a estrategias
                </Link>
              </>
            ) : (
              <>
                {/* Header */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <Link href="/dashboard/strategies" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
                    ← Volver a estrategias
                  </Link>
                </div>

                <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h1 style={{ fontSize: '1.875rem', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    {strategy.name}
                  </h1>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Creada: {formatDate(strategy.createdAt)}
                  </p>
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

                {/* Metrics */}
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
                  <div style={{ overflowX: 'auto' }}>
                    <table className="strategy-metrics-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.75rem', textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Métrica</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', color: '#f87171', borderBottom: '1px solid var(--border)' }}>P10</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', color: '#60a5fa', borderBottom: '1px solid var(--border)' }}>P50</th>
                          <th style={{ padding: '0.75rem', textAlign: 'right', color: '#34d399', borderBottom: '1px solid var(--border)' }}>P90</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Período</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>{strategy.metrics.p10.startDate.slice(0, 7)} a {strategy.metrics.p10.endDate.slice(0, 7)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>{strategy.metrics.p50.startDate.slice(0, 7)} a {strategy.metrics.p50.endDate.slice(0, 7)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>{strategy.metrics.p90.startDate.slice(0, 7)} a {strategy.metrics.p90.endDate.slice(0, 7)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Capital final</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500', borderBottom: '1px solid var(--border)' }}>{fmtUsd(strategy.metrics.p10.finalCapital)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500', borderBottom: '1px solid var(--border)' }}>{fmtUsd(strategy.metrics.p50.finalCapital)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', fontWeight: '500', borderBottom: '1px solid var(--border)' }}>{fmtUsd(strategy.metrics.p90.finalCapital)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>CAGR</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: strategy.metrics.p10.cagr >= 0 ? '#34d399' : '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p10.cagr)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: strategy.metrics.p50.cagr >= 0 ? '#34d399' : '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p50.cagr)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: strategy.metrics.p90.cagr >= 0 ? '#34d399' : '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p90.cagr)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Sharpe</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{strategy.metrics.p10.sharpe.toFixed(2)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{strategy.metrics.p50.sharpe.toFixed(2)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{strategy.metrics.p90.sharpe.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>Max Drawdown</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p10.maxDrawdownEquity)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p50.maxDrawdownEquity)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'right', color: '#f87171', borderBottom: '1px solid var(--border)' }}>{fmtPct(strategy.metrics.p90.maxDrawdownEquity)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Apply section */}
                <div style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                }}>
                  <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1rem', fontWeight: '600' }}>
                    Aplicar a portfolio
                  </h3>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                    <p style={{ margin: '0 0 0.5rem 0' }}><strong>Esto actualizará:</strong></p>
                    <ul style={{ margin: '0 0 1rem 1rem', padding: 0 }}>
                      <li>Pesos objetivo (targetWeights)</li>
                      <li>Añadirá activos faltantes (sin posiciones)</li>
                    </ul>
                    <p style={{ margin: '0 0 0.5rem 0' }}><strong>NO modificará:</strong></p>
                    <ul style={{ margin: '0 0 0 1rem', padding: 0 }}>
                      <li>Tus posiciones actuales (cantidades)</li>
                      <li>Tu equity ni borrowed amount</li>
                    </ul>
                  </div>

                  {applyResult && (
                    <div style={{
                      padding: '0.75rem',
                      background: applyResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      border: `1px solid ${applyResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      borderRadius: '6px',
                      color: applyResult.success ? '#10b981' : '#ef4444',
                      fontSize: '0.875rem',
                      marginBottom: '1rem',
                    }}>
                      {applyResult.message}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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

                    <button
                      onClick={handleApply}
                      disabled={applying || !portfolioId}
                      style={{
                        padding: '0.75rem 1.5rem',
                        background: applying ? 'var(--border)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: applying || !portfolioId ? 'not-allowed' : 'pointer',
                        fontSize: '0.9375rem',
                        fontWeight: '500',
                      }}
                    >
                      {applying ? 'Aplicando...' : 'Aplicar a mi portfolio'}
                    </button>
                  </div>
                </div>

                {/* Delete */}
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
