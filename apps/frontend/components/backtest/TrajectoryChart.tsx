import React, { useMemo, useState, useCallback, useRef } from 'react';
import type { BacktestResult } from '../../lib/backtest/types';
import { timeWeightedReturns } from '../../lib/backtest/engine/metrics';
import { formatNumberES } from '../../lib/number-format';

interface Props {
  result: BacktestResult;
}

/**
 * 'return': cumulative time-weighted return, contributions stripped out.
 * 'equity': account equity, which climbs with every monthly contribution.
 */
type ChartMode = 'return' | 'equity';

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
const fmtPctTick = (v: number) => {
  const pct = Number((v * 100).toFixed(1));
  return (pct > 0 ? '+' : '') + pct + '%';
};

// Chart dimensions (constant)
const CHART_WIDTH = 800;
const CHART_HEIGHT = 420;
const PADDING = { top: 16, right: 20, bottom: 36, left: 65 };
const INNER_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right;
const INNER_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom;

export default function TrajectoryChart({ result }: Props) {
  const [hover, setHover] = useState<HoverData | null>(null);
  const [mode, setMode] = useState<ChartMode>('return');
  const svgRef = useRef<SVGSVGElement>(null);

  const p10Idx = result.p10.windowIndex;
  const p50Idx = result.p50.windowIndex;
  const p90Idx = result.p90.windowIndex;

  // One series per window, for each mode. The return series is the time-weighted growth
  // index minus 1, so every window starts at 0% and deposits never move it.
  const equitySeries = useMemo(
    () => result.trajectories.map((t) => t.states.map((s) => s.equity)),
    [result]
  );
  const returnSeries = useMemo(
    () => result.trajectories.map((t) =>
      timeWeightedReturns(t.states, t.contributions, t.contributionIndices).index.map((v) => v - 1)
    ),
    [result]
  );
  const series = mode === 'return' ? returnSeries : equitySeries;

  const { paths, p10Path, p50Path, p90Path, p50AreaPath, yMin, yMax, maxMonths, yTicks } = useMemo(() => {
    const maxDays = Math.max(...series.map((s) => s.length));
    const maxMo = Math.ceil(maxDays / 21);

    let minY = Infinity;
    let maxY = -Infinity;
    for (const values of series) {
      for (let i = 0; i < values.length; i += 21) {
        if (values[i] < minY) minY = values[i];
        if (values[i] > maxY) maxY = values[i];
      }
      const last = values[values.length - 1];
      if (last < minY) minY = last;
      if (last > maxY) maxY = last;
    }

    if (mode === 'return') {
      // Returns go negative, so pad both ends instead of anchoring at zero
      const pad = (maxY - minY || 0.1) * 0.1;
      minY -= pad;
      maxY += pad;
    } else {
      minY = Math.max(0, minY * 0.9);
      maxY = maxY * 1.1;
    }

    const sx = (month: number) => PADDING.left + (month / maxMo) * INNER_WIDTH;
    const sy = (value: number) => PADDING.top + INNER_HEIGHT - ((value - minY) / (maxY - minY)) * INNER_HEIGHT;

    const toPath = (values: number[]): string => {
      const step = Math.max(1, Math.floor(values.length / 120));
      const pts: string[] = [];
      for (let i = 0; i < values.length; i += step) {
        pts.push(`${sx(i / 21).toFixed(1)},${sy(values[i]).toFixed(1)}`);
      }
      const last = values.length - 1;
      pts.push(`${sx(last / 21).toFixed(1)},${sy(values[last]).toFixed(1)}`);
      return 'M' + pts.join('L');
    };

    const allPaths = series.map(toPath);

    const p10P = series[p10Idx] ? toPath(series[p10Idx]) : '';
    const p50P = series[p50Idx] ? toPath(series[p50Idx]) : '';
    const p90P = series[p90Idx] ? toPath(series[p90Idx]) : '';

    // Area fill between the P50 line and the baseline (0% for returns, chart floor for equity)
    let p50Area = '';
    if (series[p50Idx]) {
      const baselineValue = mode === 'return' ? Math.min(Math.max(0, minY), maxY) : minY;
      const baseline = sy(baselineValue).toFixed(1);
      const lastMonth = (series[p50Idx].length - 1) / 21;
      p50Area = p50P + `L${sx(lastMonth).toFixed(1)},${baseline}L${sx(0).toFixed(1)},${baseline}Z`;
    }

    // Y ticks — nice round numbers
    const range = maxY - minY;
    const rawStep = range / (mode === 'return' ? 8 : 5);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    // 2.5 keeps percentage grids dense enough; dollar labels are rounded to $1K, so they skip it
    const multiples = mode === 'return' ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
    const niceStep = multiples.map(m => m * mag).find(s => s >= rawStep) || rawStep;
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
  }, [series, mode, p10Idx, p50Idx, p90Idx]);

  const scaleX = useCallback((month: number) => PADDING.left + (month / maxMonths) * INNER_WIDTH, [maxMonths]);
  const scaleY = useCallback((value: number) => PADDING.top + INNER_HEIGHT - ((value - yMin) / (yMax - yMin)) * INNER_HEIGHT, [yMin, yMax]);

  // month = Infinity reads the final value
  const valueAtMonth = useCallback((values: number[] | undefined, month: number) => {
    if (!values || values.length === 0) return 0;
    const dayIdx = Math.min(Math.round(month * 21), values.length - 1);
    return values[dayIdx];
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleRatio = CHART_WIDTH / rect.width;
    const svgX = (e.clientX - rect.left) * scaleRatio;
    const month = ((svgX - PADDING.left) / INNER_WIDTH) * maxMonths;

    if (month < 0 || month > maxMonths) { setHover(null); return; }

    setHover({
      month: Math.round(month),
      svgX,
      p10Equity: valueAtMonth(equitySeries[p10Idx], month),
      p50Equity: valueAtMonth(equitySeries[p50Idx], month),
      p90Equity: valueAtMonth(equitySeries[p90Idx], month),
      p10Return: valueAtMonth(returnSeries[p10Idx], month),
      p50Return: valueAtMonth(returnSeries[p50Idx], month),
      p90Return: valueAtMonth(returnSeries[p90Idx], month),
    });
  }, [maxMonths, equitySeries, returnSeries, p10Idx, p50Idx, p90Idx, valueAtMonth]);

  // Info panel values — show final values when not hovering
  const display = hover ?? {
    month: maxMonths,
    svgX: 0,
    p10Equity: valueAtMonth(equitySeries[p10Idx], Infinity),
    p50Equity: valueAtMonth(equitySeries[p50Idx], Infinity),
    p90Equity: valueAtMonth(equitySeries[p90Idx], Infinity),
    p10Return: valueAtMonth(returnSeries[p10Idx], Infinity),
    p50Return: valueAtMonth(returnSeries[p50Idx], Infinity),
    p90Return: valueAtMonth(returnSeries[p90Idx], Infinity),
  };

  // The plotted magnitude leads; the other one rides along as context
  const panelItems = [
    { label: 'P10', color: '#f87171', equity: display.p10Equity, ret: display.p10Return },
    { label: 'P50', color: '#60a5fa', equity: display.p50Equity, ret: display.p50Return },
    { label: 'P90', color: '#34d399', equity: display.p90Equity, ret: display.p90Return },
  ].map((item) => {
    const retColor = item.ret >= 0 ? '#34d399' : '#f87171';
    return mode === 'return'
      ? { ...item, primary: fmtPct(item.ret), secondary: fmtUsd(item.equity), secondaryColor: 'var(--text-secondary)' }
      : { ...item, primary: fmtUsd(item.equity), secondary: fmtPct(item.ret), secondaryColor: retColor };
  });

  const hoverY = hover && (mode === 'return'
    ? { p10: hover.p10Return, p50: hover.p50Return, p90: hover.p90Return }
    : { p10: hover.p10Equity, p50: hover.p50Equity, p90: hover.p90Equity });

  const modeOptions: { value: ChartMode; label: string }[] = [
    { value: 'return', label: 'Retorno acumulado' },
    { value: 'equity', label: 'Capital' },
  ];

  // X-axis: year labels every 12 months
  const xLabels = Array.from({ length: Math.floor(maxMonths / 12) + 1 }, (_, i) => i * 12);

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
      padding: '1.5rem', marginBottom: '1.5rem',
    }}>
      {/* ── Mode toggle ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '0.75rem 1rem', flexWrap: 'wrap', marginBottom: '1rem',
      }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', flex: '1 1 260px' }}>
          {mode === 'return'
            ? 'Retorno acumulado de la cartera (time-weighted). Las aportaciones no cuentan: solo lo que ha generado el mercado.'
            : 'Capital de la cuenta. Incluye el capital inicial y cada aportación mensual, además del retorno.'}
        </span>
        <div style={{
          display: 'flex', padding: '2px', background: 'var(--hover-bg)',
          border: '1px solid var(--border)', borderRadius: '6px',
        }}>
          {modeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setMode(opt.value); setHover(null); }}
              aria-pressed={mode === opt.value}
              style={{
                padding: '0.375rem 0.75rem', border: 'none', borderRadius: '4px', cursor: 'pointer',
                fontSize: '0.8125rem', fontWeight: '500',
                background: mode === opt.value ? 'var(--bg-card)' : 'transparent',
                color: mode === opt.value ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Info panel ── */}
      <div className="trajectory-info-panel" style={{
        position: 'relative',
        padding: '0.625rem 1rem', marginBottom: '1rem',
        background: 'var(--hover-bg)', border: '1px solid var(--border)', borderRadius: '6px',
        minHeight: '40px', fontSize: '0.8125rem',
      }}>
        {/* Desktop layout */}
        <div className="trajectory-info-desktop" style={{
          display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap',
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
                <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.9375rem' }}>{item.primary}</span>
                <span style={{ color: item.secondaryColor, fontSize: '0.75rem', fontWeight: '500' }}>{item.secondary}</span>
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

        {/* Mobile layout */}
        <div className="trajectory-info-mobile" style={{ display: 'none' }}>
          {/* Month badge top-right */}
          <div style={{
            position: 'absolute', top: '0.5rem', right: '0.75rem',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
          }}>
            <span style={{ color: 'var(--text-dim)', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mes</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.8125rem' }}>{display.month}</span>
          </div>

          {/* P10 / P50 / P90 stacked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {panelItems.map((item) => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  color: 'var(--text-dim)', fontSize: '0.6875rem', textTransform: 'uppercase',
                  letterSpacing: '0.5px', minWidth: '36px',
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                  {item.label}
                </span>
                <span style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '0.8125rem' }}>{item.primary}</span>
                <span style={{ color: item.secondaryColor, fontSize: '0.6875rem', fontWeight: '500' }}>{item.secondary}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .trajectory-info-desktop { display: none !important; }
          .trajectory-info-mobile { display: block !important; }
        }
      `}</style>

      {/* ── SVG Chart ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
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
              x1={PADDING.left} x2={CHART_WIDTH - PADDING.right}
              y1={scaleY(tick)} y2={scaleY(tick)}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={PADDING.left - 10} y={scaleY(tick) + 4}
              fill="var(--text-secondary)" fontSize="10" textAnchor="end" fontFamily="monospace"
            >
              {mode === 'return' ? fmtPctTick(tick) : `$${formatNumberES(tick / 1000, { maximumFractionDigits: 0 })}K`}
            </text>
          </g>
        ))}

        {/* X-axis lines and labels */}
        {xLabels.map((month) => (
          <g key={month}>
            <line
              x1={scaleX(month)} x2={scaleX(month)}
              y1={PADDING.top} y2={CHART_HEIGHT - PADDING.bottom}
              stroke="var(--border)" strokeWidth="1"
            />
            <text
              x={scaleX(month)} y={CHART_HEIGHT - 12}
              fill="var(--text-secondary)" fontSize="10" textAnchor="middle" fontFamily="monospace"
            >
              {month === 0 ? '0' : `${month / 12}a`}
            </text>
          </g>
        ))}

        {/* 0% baseline: below it the portfolio has lost money regardless of deposits */}
        {mode === 'return' && yMin < 0 && yMax > 0 && (
          <line
            x1={PADDING.left} x2={CHART_WIDTH - PADDING.right}
            y1={scaleY(0)} y2={scaleY(0)}
            stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="4 3"
          />
        )}

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
        {hover && hoverY && (
          <g>
            <line
              x1={hover.svgX} x2={hover.svgX}
              y1={PADDING.top} y2={CHART_HEIGHT - PADDING.bottom}
              stroke="var(--border-light)" strokeWidth="1"
            />
            {/* Dots on P10/P50/P90 */}
            <circle cx={hover.svgX} cy={scaleY(hoverY.p10)} r="3.5" fill="#f87171" stroke="var(--bg-body)" strokeWidth="1.5" />
            <circle cx={hover.svgX} cy={scaleY(hoverY.p90)} r="3.5" fill="#34d399" stroke="var(--bg-body)" strokeWidth="1.5" />
            <circle cx={hover.svgX} cy={scaleY(hoverY.p50)} r="4.5" fill="#60a5fa" stroke="var(--bg-body)" strokeWidth="1.5" />
          </g>
        )}

        {/* Axis border lines */}
        <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={CHART_HEIGHT - PADDING.bottom} stroke="var(--border)" strokeWidth="1" />
        <line x1={PADDING.left} x2={CHART_WIDTH - PADDING.right} y1={CHART_HEIGHT - PADDING.bottom} y2={CHART_HEIGHT - PADDING.bottom} stroke="var(--border)" strokeWidth="1" />
      </svg>
    </div>
  );
}
