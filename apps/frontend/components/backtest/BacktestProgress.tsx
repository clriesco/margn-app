import React from 'react';
import type { BacktestProgress as ProgressType } from '../../lib/backtest/types';
import { formatNumberES } from '../../lib/number-format';

interface Props {
  progress: ProgressType;
  onCancel: () => void;
}

const stageLabels: Record<string, string> = {
  optimizing: 'Optimizando pesos...',
  simulating: 'Simulando ventanas...',
  aggregating: 'Agregando resultados...',
  done: 'Completado',
};

export default function BacktestProgress({ progress, onCancel }: Props) {
  return (
    <div style={{
      background: '#131b2e',
      border: '1px solid #1e293b',
      borderRadius: '8px',
      padding: '2rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#f1f5f9', fontWeight: '600', fontSize: '1.125rem', margin: 0 }}>
          {stageLabels[progress.stage] || progress.stage}
        </h3>
        <button
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            background: 'rgba(239,68,68,0.1)',
            color: '#ef4444',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Cancelar
        </button>
      </div>

      {/* Progress bar */}
      <div style={{
        width: '100%',
        height: '8px',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: '1rem',
      }}>
        <div style={{
          width: `${progress.percent}%`,
          height: '100%',
          background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          borderRadius: '4px',
          transition: 'width 0.3s ease',
        }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.875rem' }}>
        <span>
          Ventana {progress.windowsCompleted} de {progress.totalWindows}
        </span>
        <span>{progress.percent}%</span>
      </div>

      {/* Partial P50 */}
      {progress.partialP50 && (
        <div style={{
          marginTop: '1.5rem',
          padding: '1rem',
          background: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: '6px',
        }}>
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
            P50 parcial (actualizado)
          </p>
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Capital Final</span>
              <p style={{ color: '#f1f5f9', fontWeight: '600', margin: '0.25rem 0 0' }}>
                ${formatNumberES(progress.partialP50.finalCapital, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div>
              <span style={{ color: '#64748b', fontSize: '0.75rem' }}>Sharpe</span>
              <p style={{ color: '#f1f5f9', fontWeight: '600', margin: '0.25rem 0 0' }}>
                {progress.partialP50.sharpe.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
