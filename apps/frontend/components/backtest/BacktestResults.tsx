import React, { useState, useMemo } from 'react';
import type { BacktestResult, WindowMetrics } from '../../lib/backtest/types';
import { formatNumberES } from '../../lib/number-format';
import EquityBreakdownChart from './EquityBreakdownChart';

interface Props {
  result: BacktestResult;
}

/** Green for positive, red for negative, neutral otherwise */
function valueColor(v: number, positive: 'green' | 'red' | 'neutral'): string {
  if (positive === 'neutral') return 'var(--text-secondary)';
  if (positive === 'green') return v >= 0 ? '#34d399' : '#f87171';
  // positive === 'red' means higher = worse (e.g. drawdown is already negative)
  return v <= 0 ? '#f87171' : '#34d399';
}

// ---------------------------------------------------------------------------
// SVG Pie Chart for equity breakdown
// ---------------------------------------------------------------------------
function EquityPieChart({ label, initialCapital, totalContributed, finalCapital }: {
  label: string;
  initialCapital: number;
  totalContributed: number;
  finalCapital: number;
}) {
  const returns = finalCapital - initialCapital - totalContributed;
  const total = Math.abs(initialCapital) + Math.abs(totalContributed) + Math.abs(returns);

  const slices = [
    { name: 'Capital inicial', value: initialCapital, color: '#64748b' },
    { name: 'Aportaciones', value: totalContributed, color: '#60a5fa' },
    { name: 'Retornos', value: returns, color: returns >= 0 ? '#34d399' : '#f87171' },
  ].filter((s) => Math.abs(s.value) > 0);

  const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });
  const fmtPct = (v: number) => (v >= 0 ? '+' : '') + (v * 100 / Math.max(initialCapital + totalContributed, 1)).toFixed(0) + '%';

  // SVG arc math
  const size = 140;
  const cx = size / 2, cy = size / 2, r = size / 2 - 4;
  let cumAngle = -Math.PI / 2; // start at top

  const arcs = slices.map((slice) => {
    const fraction = Math.abs(slice.value) / total;
    const angle = fraction * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += angle;
    const endAngle = cumAngle;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const d = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
    return { ...slice, d, fraction };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontWeight: '600', marginBottom: '0.5rem' }}>{label}</span>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: `${size}px`, height: `${size}px` }}>
        {arcs.map((arc) => (
          <path key={arc.name} d={arc.d} fill={arc.color} stroke="var(--bg-card)" strokeWidth="2" />
        ))}
      </svg>
      {/* Total + return below the pie */}
      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <div style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '1rem' }}>{fmtUsd(finalCapital)}</div>
        <div style={{ color: returns >= 0 ? '#34d399' : '#f87171', fontSize: '0.8125rem', fontWeight: '500' }}>{fmtPct(returns)}</div>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.5rem', width: '100%' }}>
        {arcs.map((arc) => (
          <div key={arc.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: arc.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--text-muted)' }}>{arc.name}</span>
            </div>
            <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{fmtUsd(arc.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricRow({ label, p10, p50, p90, format, coloring, idx }: {
  label: string;
  p10: number; p50: number; p90: number;
  format: (v: number) => string;
  coloring: 'green' | 'red' | 'neutral';
  idx?: number;
}) {
  const rowBg = idx !== undefined && idx % 2 === 1 ? 'var(--hover-bg)' : 'transparent';
  const cellStyle = (v: number): React.CSSProperties => ({
    padding: '0.75rem 1rem',
    color: valueColor(v, coloring),
    textAlign: 'right',
    borderBottom: '1px solid var(--border)',
  });

  return (
    <tr className="table-row-hoverable" style={{ background: rowBg, transition: "background 0.15s ease" }}>
      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)', fontWeight: '500', borderBottom: '1px solid var(--border)' }}>
        {label}
      </td>
      <td style={cellStyle(p10)}>{format(p10)}</td>
      <td style={cellStyle(p50)}>{format(p50)}</td>
      <td style={cellStyle(p90)}>{format(p90)}</td>
    </tr>
  );
}

export default function BacktestResults({ result }: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const { p10, p50, p90 } = result;

  const fmtUsd = (v: number) => '$' + formatNumberES(v, { maximumFractionDigits: 0 });
  const fmtPct = (v: number) => (v * 100).toFixed(1) + '%';
  const fmtNum = (v: number) => v.toFixed(2);
  const fmtDays = (v: number) => String(Math.round(v));

  const sortedWindows = [...result.windows].sort((a, b) => b.sharpe - a.sharpe);

  const thStyle: React.CSSProperties = {
    padding: '0.75rem 1rem', color: 'var(--text-muted)', textAlign: 'right',
    fontSize: '0.8125rem', borderBottom: '1px solid var(--border-light)',
  };

  return (
    <div>
      {/* Summary */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '1.5rem', marginBottom: '1.5rem',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.125rem', margin: 0 }}>
            Resumen
          </h3>
          <div style={{ display: 'flex', gap: '1.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <span>{result.totalWindows} ventanas</span>
            <span>{result.marginCallCount} margin calls</span>
          </div>
        </div>

        {/* Excluded symbols warning */}
        {result.excludedSymbols && result.excludedSymbols.length > 0 && (
          <div style={{
            background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px',
            padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.875rem', color: '#92400e',
          }}>
            Activos excluidos por fechas insuficientes: <strong>{result.excludedSymbols.join(', ')}</strong>.
            Los pesos se renormalizaron entre los activos restantes.
          </div>
        )}

        {/* Weights used */}
        <div style={{
          display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.25rem',
        }}>
          {Object.entries(result.weightsUsed).map(([symbol, weight]) => (
            <span key={symbol} style={{
              padding: '0.25rem 0.75rem', background: 'var(--hover-bg)',
              border: '1px solid var(--border-light)', borderRadius: '20px',
              color: 'var(--text-muted)', fontSize: '0.8125rem',
            }}>
              {symbol}: {(weight * 100).toFixed(1)}%
            </span>
          ))}
        </div>

        {/* P10/P50/P90 table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>Métrica</th>
                <th style={thStyle}>P10</th>
                <th style={thStyle}>P50</th>
                <th style={thStyle}>P90</th>
              </tr>
            </thead>
            <tbody>
              <MetricRow idx={0} label="Capital Final" p10={p10.finalCapital} p50={p50.finalCapital} p90={p90.finalCapital} format={fmtUsd} coloring="green" />
              <MetricRow idx={1} label="Retorno %" p10={p10.returnPercent} p50={p50.returnPercent} p90={p90.returnPercent} format={fmtPct} coloring="green" />
              <MetricRow idx={2} label="CAGR" p10={p10.cagr} p50={p50.cagr} p90={p90.cagr} format={fmtPct} coloring="green" />
              <MetricRow idx={3} label="Sharpe" p10={p10.sharpe} p50={p50.sharpe} p90={p90.sharpe} format={fmtNum} coloring="neutral" />
              <MetricRow idx={4} label="Max Drawdown" p10={p10.maxDrawdownEquity} p50={p50.maxDrawdownEquity} p90={p90.maxDrawdownEquity} format={fmtPct} coloring="red" />
              <MetricRow idx={5} label="Recovery (días)" p10={p10.recoveryDays} p50={p50.recoveryDays} p90={p90.recoveryDays} format={fmtDays} coloring="neutral" />
              <MetricRow idx={6} label="Leverage Final" p10={p10.finalLeverage} p50={p50.finalLeverage} p90={p90.finalLeverage} format={fmtNum} coloring="neutral" />
            </tbody>
          </table>
        </div>
      </div>

      {/* Equity breakdown pie charts */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
        padding: '1.5rem', marginBottom: '1.5rem',
      }}>
        <h3 style={{ color: 'var(--text-primary)', fontWeight: '600', fontSize: '1.125rem', marginBottom: '1.25rem' }}>
          Composición del Capital Final
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
          {([
            { label: 'P10', metrics: p10 },
            { label: 'P50', metrics: p50 },
            { label: 'P90', metrics: p90 },
          ] as const).map(({ label, metrics }) => (
            <EquityPieChart
              key={label}
              label={label}
              initialCapital={result.config.initialCapital}
              totalContributed={metrics.totalContributed}
              finalCapital={metrics.finalCapital}
            />
          ))}
        </div>
      </div>

      {/* Breakdown toggle */}
      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        style={{
          width: '100%', padding: '0.75rem',
          background: 'var(--hover-bg)', color: 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: '8px',
          cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1rem',
        }}
      >
        {showBreakdown ? 'Ocultar desglose del equity' : 'Ver desglose del equity por meses'}
      </button>

      {showBreakdown && <EquityBreakdownChart result={result} />}

      {/* Detail toggle */}
      <button
        onClick={() => setShowDetail(!showDetail)}
        style={{
          width: '100%', padding: '0.75rem',
          background: 'var(--hover-bg)', color: 'var(--text-muted)',
          border: '1px solid var(--border)', borderRadius: '8px',
          cursor: 'pointer', fontSize: '0.875rem', marginBottom: '1rem',
        }}
      >
        {showDetail ? 'Ocultar detalle por ventana' : `Ver detalle por ventana (${result.totalWindows})`}
      </button>

      {/* Detail table */}
      {showDetail && (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
          padding: '1rem', overflowX: 'auto',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                {['#', 'Inicio', 'Fin', 'Capital', 'Sharpe', 'CAGR', 'Max DD', 'Margin Call'].map((h) => (
                  <th key={h} style={{ padding: '0.5rem', color: 'var(--text-muted)', textAlign: 'right', borderBottom: '1px solid var(--border-light)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedWindows.map((w, i) => (
                <tr key={w.windowIndex} className="table-row-hoverable" style={{ background: i % 2 === 1 ? "var(--hover-bg)" : "transparent", transition: "background 0.15s ease" }}>
                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{i + 1}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{w.startDate}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{w.endDate}</td>
                  <td style={{ padding: '0.5rem', color: valueColor(w.finalCapital, 'green'), textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtUsd(w.finalCapital)}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtNum(w.sharpe)}</td>
                  <td style={{ padding: '0.5rem', color: valueColor(w.cagr, 'green'), textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtPct(w.cagr)}</td>
                  <td style={{ padding: '0.5rem', color: valueColor(w.maxDrawdownEquity, 'red'), textAlign: 'right', borderBottom: '1px solid var(--border)' }}>{fmtPct(w.maxDrawdownEquity)}</td>
                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                    {w.marginCall ? 'Sí' : 'No'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
