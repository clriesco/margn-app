import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { BacktestResult, WindowTrajectory } from '../../lib/backtest/types';
import { formatNumberES } from '../../lib/number-format';

interface Props {
  result: BacktestResult;
}

interface MonthPoint {
  month: number;
  equity: number;
  initialCapital: number;
  cumulativeContributions: number;
  returns: number;
}

const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });

function extractMonthlyBreakdown(
  traj: WindowTrajectory,
  initialCapital: number,
  monthlyContribution: number,
): MonthPoint[] {
  const points: MonthPoint[] = [];
  const states = traj.states;

  // Month 0
  points.push({
    month: 0,
    equity: states[0].equity,
    initialCapital,
    cumulativeContributions: 0,
    returns: states[0].equity - initialCapital,
  });

  // Each subsequent month (~21 trading days)
  let cumContrib = 0;
  for (let m = 1; m * 21 < states.length; m++) {
    const dayIdx = Math.min(m * 21, states.length - 1);
    cumContrib += monthlyContribution;
    const eq = states[dayIdx].equity;
    points.push({
      month: m,
      equity: eq,
      initialCapital,
      cumulativeContributions: cumContrib,
      returns: eq - initialCapital - cumContrib,
    });
  }

  // Final point if not already at a month boundary
  const lastDay = states.length - 1;
  const lastMonth = points[points.length - 1].month;
  if (lastDay > lastMonth * 21) {
    const finalContribs = traj.contributions.reduce((a, b) => a + b, 0);
    const eq = states[lastDay].equity;
    points.push({
      month: Math.ceil(lastDay / 21),
      equity: eq,
      initialCapital,
      cumulativeContributions: finalContribs,
      returns: eq - initialCapital - finalContribs,
    });
  }

  return points;
}

function SingleBreakdownChart({ label, points, yMin, yMax, maxMonth }: {
  label: string;
  points: MonthPoint[];
  yMin: number;
  yMax: number;
  maxMonth: number;
}) {
  const [hover, setHover] = useState<MonthPoint | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chartWidth = 800;
  const chartHeight = 280;
  const pad = { top: 12, right: 16, bottom: 32, left: 65 };
  const innerW = chartWidth - pad.left - pad.right;
  const innerH = chartHeight - pad.top - pad.bottom;

  const range = Math.max(yMax - yMin, 1);
  const sx = (month: number) => pad.left + (month / maxMonth) * innerW;
  const sy = (v: number) => pad.top + innerH - ((v - yMin) / range) * innerH;

  // Build area paths: stack from bottom
  // Layer 1 (bottom): initial capital — constant band from 0 to initialCapital
  // Layer 2 (middle): contributions — from initialCapital to initialCapital + cumContrib
  // Layer 3 (top): returns can be positive (above layer 2) or negative (dips below layer 2)
  // Instead of true stacking with negative, just show: invested area + equity line + colored gap

  // "Total invested" area (initialCapital + contributions)
  const investedPathUp = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.initialCapital + p.cumulativeContributions).toFixed(1)}`).join(' ');
  const investedPathDown = [...points].reverse().map((p) => `${sx(p.month).toFixed(1)},${sy(0 > yMin ? 0 : yMin).toFixed(1)}`).join(' ');

  // Split invested into initial capital area and contributions area
  const baseY = sy(0 > yMin ? 0 : yMin);

  // Initial capital band: constant rectangle-ish
  const icTop = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.initialCapital).toFixed(1)}`).join(' ');
  const icBottom = [...points].reverse().map((p) => `${sx(p.month).toFixed(1)},${baseY.toFixed(1)}`).join(' ');

  // Contributions band: from initialCapital up to initialCapital + cumContrib
  const contribTop = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.initialCapital + p.cumulativeContributions).toFixed(1)}`).join(' ');
  const contribBottom = [...points].reverse().map((p) => `${sx(p.month).toFixed(1)},${sy(p.initialCapital).toFixed(1)}`).join(' ');

  // Equity line
  const equityLine = points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.equity).toFixed(1)}`).join(' ');

  // Returns area: between invested top and equity line
  // When returns > 0: green fill above invested
  // When returns < 0: red fill below invested
  // We'll draw this as the area between equity line and invested line
  const returnsAreaAbove = points.map((p) => {
    const invested = p.initialCapital + p.cumulativeContributions;
    const top = Math.max(p.equity, invested);
    return `${sx(p.month).toFixed(1)},${sy(top).toFixed(1)}`;
  }).join(' ');
  const returnsAreaAboveBottom = [...points].reverse().map((p) => {
    const invested = p.initialCapital + p.cumulativeContributions;
    return `${sx(p.month).toFixed(1)},${sy(invested).toFixed(1)}`;
  }).join(' ');

  const returnsAreaBelow = points.map((p) => {
    const invested = p.initialCapital + p.cumulativeContributions;
    return `${sx(p.month).toFixed(1)},${sy(invested).toFixed(1)}`;
  }).join(' ');
  const returnsAreaBelowBottom = [...points].reverse().map((p) => {
    const invested = p.initialCapital + p.cumulativeContributions;
    const bottom = Math.min(p.equity, invested);
    return `${sx(p.month).toFixed(1)},${sy(bottom).toFixed(1)}`;
  }).join(' ');

  // Y ticks
  const rawStep = range / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const niceStep = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) || rawStep;
  const yTicks: number[] = [];
  let t = Math.ceil(yMin / niceStep) * niceStep;
  while (t <= yMax) { yTicks.push(t); t += niceStep; }

  // X labels every 12 months
  const xLabels = Array.from({ length: Math.floor(maxMonth / 12) + 1 }, (_, i) => i * 12);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const month = ((svgX - pad.left) / innerW) * maxMonth;
    if (month < 0 || month > maxMonth) { setHover(null); return; }
    // Find nearest point
    let closest = points[0];
    let minDist = Math.abs(points[0].month - month);
    for (const p of points) {
      const d = Math.abs(p.month - month);
      if (d < minDist) { minDist = d; closest = p; }
    }
    setHover(closest);
  }, [points, maxMonth, innerW]);

  const display = hover ?? points[points.length - 1];

  return (
    <div style={{
      background: '#131b2e', border: '1px solid #1e293b', borderRadius: '8px',
      padding: '1.5rem', marginBottom: '1rem',
    }}>
      {/* Info panel */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap',
        padding: '0.5rem 0.875rem', marginBottom: '0.75rem',
        background: 'rgba(255,255,255,0.03)', border: '1px solid #1e293b', borderRadius: '6px',
        fontSize: '0.8125rem', minHeight: '36px',
      }}>
        <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '0.875rem', minWidth: '28px' }}>{label}</span>
        <div style={{ width: '1px', height: '24px', background: '#1e293b' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mes</span>
          <span style={{ color: '#f1f5f9', fontWeight: '600' }}>{display.month}</span>
        </div>
        <div style={{ width: '1px', height: '24px', background: '#1e293b' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '2px', background: '#64748b', marginRight: '3px', verticalAlign: 'middle' }} />
            Capital inicial
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: '600' }}>{fmtUsd(display.initialCapital)}</span>
        </div>
        <div style={{ width: '1px', height: '24px', background: '#1e293b' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '2px', background: '#60a5fa', marginRight: '3px', verticalAlign: 'middle' }} />
            Aportaciones
          </span>
          <span style={{ color: '#cbd5e1', fontWeight: '600' }}>{fmtUsd(display.cumulativeContributions)}</span>
        </div>
        <div style={{ width: '1px', height: '24px', background: '#1e293b' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <span style={{ display: 'inline-block', width: '7px', height: '7px', borderRadius: '2px', background: display.returns >= 0 ? '#34d399' : '#f87171', marginRight: '3px', verticalAlign: 'middle' }} />
            Retornos
          </span>
          <span style={{ color: display.returns >= 0 ? '#34d399' : '#f87171', fontWeight: '600' }}>
            {display.returns >= 0 ? '+' : ''}{fmtUsd(display.returns)}
          </span>
        </div>
        <div style={{ width: '1px', height: '24px', background: '#1e293b' }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Equity</span>
          <span style={{ color: '#f1f5f9', fontWeight: '700' }}>{fmtUsd(display.equity)}</span>
        </div>

        {!hover && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ color: '#475569', fontSize: '0.75rem', fontStyle: 'italic' }}>Pasa el ratón por el gráfico</span>
          </>
        )}
      </div>

      {/* SVG */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={chartWidth - pad.right} y1={sy(tick)} y2={sy(tick)} stroke="#1e293b" strokeWidth="1" />
            <text x={pad.left - 8} y={sy(tick) + 4} fill="#475569" fontSize="10" textAnchor="end" fontFamily="monospace">
              ${formatNumberES(tick / 1000, { maximumFractionDigits: 0 })}K
            </text>
          </g>
        ))}
        {xLabels.map((month) => (
          <g key={month}>
            <line x1={sx(month)} x2={sx(month)} y1={pad.top} y2={chartHeight - pad.bottom} stroke="#1e293b" strokeWidth="1" />
            <text x={sx(month)} y={chartHeight - 10} fill="#475569" fontSize="10" textAnchor="middle" fontFamily="monospace">
              {month === 0 ? '0' : `${month / 12}a`}
            </text>
          </g>
        ))}

        {/* Initial capital area (gray) */}
        <polygon points={`${icTop} ${icBottom}`} fill="rgba(100,116,139,0.2)" />

        {/* Contributions area (blue) */}
        <polygon points={`${contribTop} ${contribBottom}`} fill="rgba(96,165,250,0.2)" />

        {/* Positive returns area (green) */}
        <polygon points={`${returnsAreaAbove} ${returnsAreaAboveBottom}`} fill="rgba(52,211,153,0.2)" />

        {/* Negative returns area (red) */}
        <polygon points={`${returnsAreaBelow} ${returnsAreaBelowBottom}`} fill="rgba(248,113,113,0.2)" />

        {/* Invested line (dashed) */}
        <polyline
          points={points.map((p) => `${sx(p.month).toFixed(1)},${sy(p.initialCapital + p.cumulativeContributions).toFixed(1)}`).join(' ')}
          fill="none" stroke="#475569" strokeWidth="1" strokeDasharray="4,3"
        />

        {/* Equity line */}
        <polyline points={equityLine} fill="none" stroke="#f1f5f9" strokeWidth="2" />

        {/* Hover crosshair + dot */}
        {hover && (
          <g>
            <line x1={sx(hover.month)} x2={sx(hover.month)} y1={pad.top} y2={chartHeight - pad.bottom} stroke="#334155" strokeWidth="1" />
            <circle cx={sx(hover.month)} cy={sy(hover.equity)} r="4" fill="#f1f5f9" stroke="#0f172a" strokeWidth="1.5" />
            <circle cx={sx(hover.month)} cy={sy(hover.initialCapital + hover.cumulativeContributions)} r="3" fill="#475569" stroke="#0f172a" strokeWidth="1.5" />
          </g>
        )}

        {/* Axis borders */}
        <line x1={pad.left} x2={pad.left} y1={pad.top} y2={chartHeight - pad.bottom} stroke="#1e293b" strokeWidth="1" />
        <line x1={pad.left} x2={chartWidth - pad.right} y1={chartHeight - pad.bottom} y2={chartHeight - pad.bottom} stroke="#1e293b" strokeWidth="1" />
      </svg>
    </div>
  );
}

export default function EquityBreakdownChart({ result }: Props) {
  const initialCapital = result.config.initialCapital;
  const monthlyContribution = result.config.monthlyContribution;

  const { p10Points, p50Points, p90Points, yMin, yMax, maxMonth } = useMemo(() => {
    const p10Traj = result.trajectories[result.p10.windowIndex];
    const p50Traj = result.trajectories[result.p50.windowIndex];
    const p90Traj = result.trajectories[result.p90.windowIndex];

    const p10P = p10Traj ? extractMonthlyBreakdown(p10Traj, initialCapital, monthlyContribution) : [];
    const p50P = p50Traj ? extractMonthlyBreakdown(p50Traj, initialCapital, monthlyContribution) : [];
    const p90P = p90Traj ? extractMonthlyBreakdown(p90Traj, initialCapital, monthlyContribution) : [];

    const all = [...p10P, ...p50P, ...p90P];
    if (all.length === 0) return { p10Points: [], p50Points: [], p90Points: [], yMin: 0, yMax: 100000, maxMonth: 60 };

    const maxEq = Math.max(...all.map((p) => Math.max(p.equity, p.initialCapital + p.cumulativeContributions)));
    const minEq = Math.min(...all.map((p) => Math.min(p.equity, 0)));
    const maxMo = Math.max(...all.map((p) => p.month));

    return {
      p10Points: p10P,
      p50Points: p50P,
      p90Points: p90P,
      yMin: Math.min(0, minEq * 1.05),
      yMax: maxEq * 1.1,
      maxMonth: maxMo,
    };
  }, [result, initialCapital, monthlyContribution]);

  if (p10Points.length === 0 && p50Points.length === 0 && p90Points.length === 0) return null;

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div style={{
        background: '#131b2e', border: '1px solid #1e293b', borderRadius: '8px',
        padding: '1.5rem', paddingBottom: '0.75rem', marginBottom: '0',
        borderBottomLeftRadius: 0, borderBottomRightRadius: 0,
      }}>
        <h3 style={{ color: '#f1f5f9', fontWeight: '600', fontSize: '1.125rem', margin: 0 }}>
          Desglose del Equity
        </h3>
        <p style={{ color: '#64748b', fontSize: '0.8125rem', marginTop: '0.25rem', marginBottom: 0 }}>
          Capital inicial + aportaciones acumuladas vs equity real. La diferencia son los retornos del mercado.
        </p>
      </div>
      {[
        { label: 'P10', points: p10Points },
        { label: 'P50', points: p50Points },
        { label: 'P90', points: p90Points },
      ].map(({ label, points }) =>
        points.length > 0 ? (
          <SingleBreakdownChart key={label} label={label} points={points} yMin={yMin} yMax={yMax} maxMonth={maxMonth} />
        ) : null
      )}
    </div>
  );
}
