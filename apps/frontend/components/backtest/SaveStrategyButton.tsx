import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import type { BacktestResult, WindowTrajectory } from '../../lib/backtest/types';

interface Props {
  result: BacktestResult;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

// Extract daily equity from trajectory
function extractDailyEquity(trajectory: WindowTrajectory): { date: string; equity: number }[] {
  if (!trajectory?.states) return [];
  return trajectory.states.map((s) => ({
    date: s.date,
    equity: s.equity,
  }));
}

export default function SaveStrategyButton({ result }: Props) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      setError('Por favor, introduce un nombre para la estrategia');
      return;
    }

    setSaving(true);
    setError(null);

    const token = localStorage.getItem('supabase_token');
    if (!token) {
      setError('No autenticado');
      setSaving(false);
      return;
    }

    // Build payload
    const p10Trajectory = result.trajectories[result.p10.windowIndex];
    const p50Trajectory = result.trajectories[result.p50.windowIndex];
    const p90Trajectory = result.trajectories[result.p90.windowIndex];

    const payload = {
      name: name.trim(),
      config: {
        symbols: result.config.symbols,
        weights: result.weightsUsed,
        initialCapital: result.config.initialCapital,
        monthlyContribution: result.config.monthlyContribution,
        leverageMin: result.config.leverageMin,
        leverageMax: result.config.leverageMax,
        leverageTarget: result.config.leverageTarget,
        windowMonths: result.config.windowMonths,
        weightMode: result.config.weightMode || 'manual',
        dynamicWeights: result.config.dynamicWeights || false,
      },
      metrics: {
        p10: {
          startDate: result.p10.startDate,
          endDate: result.p10.endDate,
          finalCapital: result.p10.finalCapital,
          totalContributed: result.p10.totalContributed,
          returnPercent: result.p10.returnPercent,
          cagr: result.p10.cagr,
          sharpe: Number.isFinite(result.p10.sharpe) ? result.p10.sharpe : 0,
          maxDrawdownEquity: result.p10.maxDrawdownEquity,
          recoveryDays: result.p10.recoveryDays,
          underwaterDays: result.p10.underwaterDays,
          finalLeverage: Number.isFinite(result.p10.finalLeverage) ? result.p10.finalLeverage : 0,
          windowIndex: result.p10.windowIndex,
        },
        p50: {
          startDate: result.p50.startDate,
          endDate: result.p50.endDate,
          finalCapital: result.p50.finalCapital,
          totalContributed: result.p50.totalContributed,
          returnPercent: result.p50.returnPercent,
          cagr: result.p50.cagr,
          sharpe: Number.isFinite(result.p50.sharpe) ? result.p50.sharpe : 0,
          maxDrawdownEquity: result.p50.maxDrawdownEquity,
          recoveryDays: result.p50.recoveryDays,
          underwaterDays: result.p50.underwaterDays,
          finalLeverage: Number.isFinite(result.p50.finalLeverage) ? result.p50.finalLeverage : 0,
          windowIndex: result.p50.windowIndex,
        },
        p90: {
          startDate: result.p90.startDate,
          endDate: result.p90.endDate,
          finalCapital: result.p90.finalCapital,
          totalContributed: result.p90.totalContributed,
          returnPercent: result.p90.returnPercent,
          cagr: result.p90.cagr,
          sharpe: Number.isFinite(result.p90.sharpe) ? result.p90.sharpe : 0,
          maxDrawdownEquity: result.p90.maxDrawdownEquity,
          recoveryDays: result.p90.recoveryDays,
          underwaterDays: result.p90.underwaterDays,
          finalLeverage: Number.isFinite(result.p90.finalLeverage) ? result.p90.finalLeverage : 0,
          windowIndex: result.p90.windowIndex,
        },
        totalWindows: result.totalWindows,
        marginCallCount: result.marginCallCount,
      },
      trajectories: {
        p10: { points: extractDailyEquity(p10Trajectory) },
        p50: { points: extractDailyEquity(p50Trajectory) },
        p90: { points: extractDailyEquity(p90Trajectory) },
      },
    };

    try {
      const response = await fetch(`${API_BASE_URL}/strategies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${response.status}`);
      }

      setShowModal(false);
      setName('');
      router.push('/dashboard/strategies');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSaving(false);
    }
  }, [name, result, router]);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
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
          gap: '0.5rem',
          transition: 'all 0.15s ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          <polyline points="17 21 17 13 7 13 7 21" />
          <polyline points="7 3 7 8 15 8" />
        </svg>
        Guardar estrategia
      </button>

      {showModal && (
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
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              width: '100%',
              maxWidth: '400px',
              margin: '1rem',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>
              Guardar estrategia
            </h3>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Nombre
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: BTC-GLD-SPY Conservador"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.9375rem',
                }}
                autoFocus
              />
            </div>

            <div style={{
              padding: '0.75rem',
              background: 'var(--hover-bg)',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.8125rem',
              color: 'var(--text-muted)',
            }}>
              <strong>Se guardará:</strong>
              <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                <li>Activos y pesos ({Object.keys(result.weightsUsed).join(', ')})</li>
                <li>Configuración de leverage ({result.config.leverageTarget}x)</li>
                <li>Métricas P10/P50/P90</li>
                <li>Trayectorias de equity</li>
              </ul>
            </div>

            {error && (
              <div style={{
                padding: '0.75rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                color: '#ef4444',
                fontSize: '0.875rem',
                marginBottom: '1rem',
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '0.625rem 1rem',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.625rem 1rem',
                  background: saving ? 'var(--border)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                }}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
