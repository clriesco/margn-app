import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { BacktestResult } from '../../lib/backtest/types';
import { formatNumberES } from '../../lib/number-format';

interface Props {
  result: BacktestResult;
}

interface HoverData {
  month: number;
  svgX: number;
  p10Equity: number;
  p50Equity: number;
  p90Equity: number;
  p10Return: number;
  p50Return: number;
  p90Return: number;
}

const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });
const fmtPct = (v: number) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';

export default function TrajectoryChart({ result }: Props) {
  const [hover, setHover] = useState<HoverData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const chartWidth = 800;
  const chartHeight = 420;
  const padding = { top: 16, right: 20, bottom: 36, left: 65 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  const p10Traj = result.trajectories[result.p10.windowIndex];
  const p50Traj = result.trajectories[result.p50.windowIndex];
  const p90Traj = result.trajectories[result.p90.windowIndex];

  const { paths, p10Path, p50Path, p90Path, p50AreaPath, yMin, yMax, maxMonths, yTicks } = useMemo(() => {
    const maxDays = Math.max(...result.trajectories.map((t) => t.states.length));
    const maxMo = Math.ceil(maxDays / 21);

    let minY = Infinity;
    let maxY = -Infinity;
    for (const traj of result.trajectories) {
      for (let i = 0; i < traj.states.length; i += 21) {
        const eq = traj.states[i].equity;
        if (eq < minY) minY = eq;
        if (eq > maxY) maxY = eq;
      }
      const last = traj.states[traj.states.length - 1].equity;
      if (last < minY) minY = last;
      if (last > maxY) maxY = last;
    }

    minY = Math.max(0, minY * 0.9);
    maxY = maxY * 1.1;

    const sx = (month: number) => padding.left + (month / maxMo) * innerWidth;
    const sy = (equity: number) => padding.top + innerHeight - ((equity - minY) / (maxY - minY)) * innerHeight;

    const toPath = (states: { equity: number }[]): string => {
      const step = Math.max(1, Math.floor(states.length / 120));
      const pts: string[] = [];
      for (let i = 0; i < states.length; i += step) {
        pts.push(`${sx(i / 21).toFixed(1)},${sy(states[i].equity).toFixed(1)}`);
      }
      const last = states.length - 1;
      pts.push(`${sx(last / 21).toFixed(1)},${sy(states[last].equity).toFixed(1)}`);
      return 'M' + pts.join('L');
    };

    const allPaths = result.trajectories.map((t) => toPath(t.states));

    const p10P = p10Traj ? toPath(p10Traj.states) : '';
    const p50P = p50Traj ? toPath(p50Traj.states) : '';
    const p90P = p90Traj ? toPath(p90Traj.states) : '';

    // Area fill under P50 line
    let p50Area = '';
    if (p50Traj) {
      const baseline = sy(minY).toFixed(1);
      const lastMonth = (p50Traj.states.length - 1) / 21;
      p50Area = p50P + `L${sx(lastMonth).toFixed(1)},${baseline}L${sx(0).toFixed(1)},${baseline}Z`;
    }

    // Y ticks — nice round numbers
    const range = maxY - minY;
    const rawStep = range / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const niceStep = [1, 2, 5, 10].map(m => m * mag).find(s => s >= rawStep) || rawStep;
    const ticks: number[] = [];
    let tick = Math.ceil(minY / niceStep) * niceStep;
    while (tick <= maxY) {
      ticks.push(tick);
      tick += niceStep;
    }

    return {
      paths: allPaths, p10Path: p10P, p50Path: p50P, p90Path: p90P,
      p50AreaPath: p50Area, yMin: minY, yMax: maxY, maxMonths: maxMo, yTicks: ticks,
    };
  }, [result, innerWidth, innerHeight, p10Traj, p50Traj, p90Traj]);

  const scaleX = useCallback((month: number) => padding.left + (month / maxMonths) * innerWidth, [maxMonths, innerWidth]);
  const scaleY = useCallback((equity: number) => padding.top + innerHeight - ((equity - yMin) / (yMax - yMin)) * innerHeight, [yMin, yMax, innerHeight]);

  const getEquityAtMonth = useCallback((traj: typeof p50Traj, month: number) => {
    if (!traj) return 0;
    const dayIdx = Math.min(Math.round(month * 21), traj.states.length - 1);
    return traj.states[dayIdx].equity;
  }, []);

  const initialCapital = result.config.initialCapital;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleRatio = chartWidth / rect.width;
    const svgX = (e.clientX - rect.left) * scaleRatio;
    const month = ((svgX - padding.left) / innerWidth) * maxMonths;

    if (month < 0 || month > maxMonths) { setHover(null); return; }

    const p10Eq = getEquityAtMonth(p10Traj, month);
    const p50Eq = getEquityAtMonth(p50Traj, month);
    const p90Eq = getEquityAtMonth(p90Traj, month);

    setHover({
      month: Math.round(month),
      svgX,
      p10Equity: p10Eq, p50Equity: p50Eq, p90Equity: p90Eq,
      p10Return: (p10Eq - initialCapital) / initialCapital,
      p50Return: (p50Eq - initialCapital) / initialCapital,
      p90Return: (p90Eq - initialCapital) / initialCapital,
    });
  }, [maxMonths, innerWidth, p10Traj, p50Traj, p90Traj, getEquityAtMonth, initialCapital]);

  // Info panel values — show final values when not hovering
  const display = hover ?? {
    month: maxMonths,
    svgX: 0,
    p10Equity: p10Traj ? p10Traj.states[p10Traj.states.length - 1].equity : 0,
    p50Equity: p50Traj ? p50Traj.states[p50Traj.states.length - 1].equity : 0,
    p90Equity: p90Traj ? p90Traj.states[p90Traj.states.length - 1].equity : 0,
    p10Return: p10Traj ? (p10Traj.states[p10Traj.states.length - 1].equity - initialCapital) / initialCapital : 0,
    p50Return: p50Traj ? (p50Traj.states[p50Traj.states.length - 1].equity - initialCapital) / initialCapital : 0,
    p90Return: p90Traj ? (p90Traj.states[p90Traj.states.length - 1].equity - initialCapital) / initialCapital : 0,
  };

  const panelItems: { label: string; color: string; equity: number; ret: number }[] = [
    { label: 'P10', color: '#f87171', equity: display.p10Equity, ret: display.p10Return },
    { label: 'P50', color: '#60a5fa', equity: display.p50Equity, ret: display.p50Return },
    { label: 'P90', color: '#34d399', equity: display.p90Equity, ret: display.p90Return },
  ];

  // X-axis: year labels every 12 months
  const xLabels = Array.from({ length: Math.floor(maxMonths / 12) + 1 }, (_, i) => i * 12);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
      padding: '1.5rem', marginBottom: '1.5rem',
    }}>
      {/* ── Info panel ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
        padding: '0.625rem 1rem', marginBottom: '1rem',
        background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '6px',
        minHeight: '40px', fontSize: '0.8125rem',
      }}>
        {/* Month */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mes</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.9375rem' }}>{display.month}</span>
        </div>

        {/* Separator */}
        <div style={{ width: '1px', height: '28px', background: 'var(--border)' }} />

        {/* P10 / P50 / P90 */}
        {panelItems.map((item) => (
          <div key={item.label} style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: '100px' }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: item.color, marginRight: '4px', verticalAlign: 'middle' }} />
              {item.label}
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.9375rem' }}>{fmtUsd(item.equity)}</span>
              <span style={{ color: item.ret >= 0 ? '#34d399' : '#f87171', fontSize: '0.75rem', fontWeight: '500' }}>{fmtPct(item.ret)}</span>
            </div>
          </div>
        ))}

        {!hover && (
          <>
            <div style={{ flex: 1 }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontStyle: 'italic' }}>Pasa el ratón por el gráfico</span>
          </>
        )}
      </div>

      {/* ── SVG Chart ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="p50-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={padding.left} x2={chartWidth - padding.right}
              y1={scaleY(tick)} y2={scaleY(tick)}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={padding.left - 10} y={scaleY(tick) + 4}
              fill="var(--text-secondary)" fontSize="10" textAnchor="end" fontFamily="monospace"
            >
              ${formatNumberES(tick / 1000, { maximumFractionDigits: 0 })}K
            </text>
          </g>
        ))}

        {/* X-axis lines and labels */}
        {xLabels.map((month) => (
          <g key={month}>
            <line
              x1={scaleX(month)} x2={scaleX(month)}
              y1={padding.top} y2={chartHeight - padding.bottom}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={scaleX(month)} y={chartHeight - 12}
              fill="var(--text-secondary)" fontSize="10" textAnchor="middle" fontFamily="monospace"
            >
              {month === 0 ? '0' : `${month / 12}a`}
            </text>
          </g>
        ))}

        {/* All trajectories */}
        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#475569" strokeWidth="0.5" opacity="0.12" />
        ))}

        {/* P50 area fill */}
        {p50AreaPath && <path d={p50AreaPath} fill="url(#p50-gradient)" />}

        {/* P10 / P50 / P90 lines */}
        {p10Path && <path d={p10Path} fill="none" stroke="#f87171" strokeWidth="1.5" opacity="0.8" />}
        {p90Path && <path d={p90Path} fill="none" stroke="#34d399" strokeWidth="1.5" opacity="0.8" />}
        {p50Path && <path d={p50Path} fill="none" stroke="#60a5fa" strokeWidth="2.5" />}

        {/* Hover crosshair + dots */}
        {hover && (
          <g>
            <line
              x1={hover.svgX} x2={hover.svgX}
              y1={padding.top} y2={chartHeight - padding.bottom}
              stroke="var(--border-light)" strokeWidth="1"
            />
            {/* Dots on P10/P50/P90 */}
            <circle cx={hover.svgX} cy={scaleY(hover.p10Equity)} r="3.5" fill="#f87171" stroke="var(--bg-body)" strokeWidth="1.5" />
            <circle cx={hover.svgX} cy={scaleY(hover.p90Equity)} r="3.5" fill="#34d399" stroke="var(--bg-body)" strokeWidth="1.5" />
            <circle cx={hover.svgX} cy={scaleY(hover.p50Equity)} r="4.5" fill="#60a5fa" stroke="var(--bg-body)" strokeWidth="1.5" />
          </g>
        )}

        {/* Axis border lines */}
        <line x1={padding.left} x2={padding.left} y1={padding.top} y2={chartHeight - padding.bottom} stroke="var(--border)" strokeWidth="1" />
        <line x1={padding.left} x2={chartWidth - padding.right} y1={chartHeight - padding.bottom} y2={chartHeight - padding.bottom} stroke="var(--border)" strokeWidth="1" />
      </svg>
    </div>
  );
}
