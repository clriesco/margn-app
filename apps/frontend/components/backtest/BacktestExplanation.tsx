import React, { useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import type { BacktestResult, WindowMetrics, WindowTrajectory } from '../../lib/backtest/types';

interface Props {
  result: BacktestResult;
}

export type ExplanationState = 'idle' | 'streaming' | 'complete' | 'error';

export interface BacktestExplanationHandle {
  generate: () => void;
  state: ExplanationState;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

// Sanitize numbers with meaningful clamping
const sanitize = {
  returnPct: (v: number): number => {
    if (!Number.isFinite(v)) return v < 0 ? -1 : 100;
    return Math.max(-1, Math.min(100, v));
  },
  cagr: (v: number): number => {
    if (!Number.isFinite(v)) return v < 0 ? -1 : 10;
    return Math.max(-1, Math.min(10, v));
  },
  sharpe: (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(-10, Math.min(10, v));
  },
  leverage: (v: number): number => {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(100, v));
  },
  num: (v: number): number => (Number.isFinite(v) ? v : 0),
};

// Get equity at end of each month for monthly returns
function getMonthlyEquityReturns(trajectory: WindowTrajectory): Record<string, number> {
  const { states } = trajectory;
  if (!states || states.length === 0) return {};

  const monthEndStates: Record<string, { equity: number; date: string }> = {};

  for (const state of states) {
    const month = state.date.substring(0, 7);
    monthEndStates[month] = { equity: state.equity, date: state.date };
  }

  const months = Object.keys(monthEndStates).sort();
  const monthlyReturns: Record<string, number> = {};

  for (let i = 1; i < months.length; i++) {
    const prevMonth = months[i - 1];
    const currMonth = months[i];
    const prevEquity = monthEndStates[prevMonth].equity;
    const currEquity = monthEndStates[currMonth].equity;

    if (prevEquity > 0) {
      const ret = (currEquity - prevEquity) / prevEquity;
      monthlyReturns[currMonth] = sanitize.returnPct(ret);
    }
  }

  return monthlyReturns;
}

const renderMarkdown = (text: string) => {
  let html = text
    .replace(/^#### (.+)$/gm, '<h6 style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary); margin: 1rem 0 0.5rem 0;">$1</h6>')
    .replace(/^### (.+)$/gm, '<h5 style="font-size: 0.9375rem; font-weight: 600; color: var(--text-primary); margin: 1rem 0 0.5rem 0;">$1</h5>')
    .replace(/^## (.+)$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1</h4>')
    .replace(/^# (.+)$/gm, '<h3 style="font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1</h3>')
    .replace(/^\*\*(\d+)\. ([^*]+)\*\*$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1. $2</h4>')
    .replace(/^(\d+)\. \*\*([^*]+)\*\*$/gm, '<h4 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 1.25rem 0 0.5rem 0;">$1. $2</h4>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li style="margin: 0.25rem 0;">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => `<ul style="margin: 0.5rem 0; padding-left: 1.5rem; list-style-type: disc;">${match}</ul>`)
    .replace(/\n\n+/g, '</p><p style="margin-top: 0.75rem;">')
    .replace(/\n/g, '<br/>');

  return `<div>${html}</div>`;
};

const BacktestExplanation = forwardRef<BacktestExplanationHandle, Props>(({ result }, ref) => {
  const [state, setState] = useState<ExplanationState>('idle');
  const [explanation, setExplanation] = useState('');
  const [error, setError] = useState<string | null>(null);

  const generateExplanation = useCallback(async () => {
    setState('streaming');
    setExplanation('');
    setError(null);

    const token = localStorage.getItem('supabase_token');
    if (!token) {
      setError('No autenticado. Por favor inicia sesión.');
      setState('error');
      return;
    }

    const buildScenario = (s: WindowMetrics) => {
      const trajectory = result.trajectories[s.windowIndex];
      const monthlyReturns = trajectory ? getMonthlyEquityReturns(trajectory) : {};

      return {
        startDate: s.startDate,
        endDate: s.endDate,
        finalCapital: sanitize.num(s.finalCapital),
        totalContributed: sanitize.num(s.totalContributed),
        returnPercent: sanitize.returnPct(s.returnPercent),
        cagr: sanitize.cagr(s.cagr),
        sharpe: sanitize.sharpe(s.sharpe),
        maxDrawdownEquity: sanitize.returnPct(s.maxDrawdownEquity),
        recoveryDays: sanitize.num(s.recoveryDays),
        underwaterDays: sanitize.num(s.underwaterDays),
        finalLeverage: sanitize.leverage(s.finalLeverage),
        monthlyReturns,
      };
    };

    const payload = {
      weights: result.weightsUsed,
      scenarios: {
        p10: buildScenario(result.p10),
        p50: buildScenario(result.p50),
        p90: buildScenario(result.p90),
      },
      config: {
        initialCapital: sanitize.num(result.config.initialCapital),
        monthlyContribution: sanitize.num(result.config.monthlyContribution),
        leverageMin: sanitize.num(result.config.leverageMin),
        leverageMax: sanitize.num(result.config.leverageMax),
        leverageTarget: sanitize.num(result.config.leverageTarget),
        windowMonths: sanitize.num(result.config.windowMonths),
        totalWindows: sanitize.num(result.totalWindows),
        marginCallCount: sanitize.num(result.marginCallCount),
        // Strategy configuration
        weightMode: result.config.weightMode || 'manual',
        dynamicWeights: result.config.dynamicWeights || false,
        dynamicWeightsLookback: result.config.dynamicWeightsLookback || 12,
        meanReturnShrinkage: sanitize.num(result.config.meanReturnShrinkage),
        riskFreeRate: sanitize.num(result.config.riskFreeRate),
        maxWeight: sanitize.num(result.config.maxWeight),
        minWeight: sanitize.num(result.config.minWeight),
        maintenanceMarginRatio: sanitize.num(result.config.maintenanceMarginRatio),
      },
      excludedSymbols: result.excludedSymbols,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/backtest/explain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Streaming not supported');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              setState('complete');
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.text) {
                setExplanation((prev) => prev + parsed.text);
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      setState('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
      setState('error');
    }
  }, [result]);

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    generate: generateExplanation,
    state,
  }), [generateExplanation, state]);

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.5rem',
        marginTop: '1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: state === 'idle' ? 0 : '1rem',
        }}
      >
        <div>
          <h3
            style={{
              color: 'var(--text-primary)',
              fontWeight: '600',
              fontSize: '1.125rem',
              margin: 0,
            }}
          >
            Análisis IA
          </h3>
          {state === 'idle' && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
              Genera una explicación de los resultados con inteligencia artificial
            </p>
          )}
        </div>

        {state === 'idle' && (
          <button
            onClick={generateExplanation}
            style={{
              padding: '0.625rem 1rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Explicar con IA
          </button>
        )}

        {state === 'complete' && (
          <button
            onClick={generateExplanation}
            style={{
              padding: '0.5rem 1rem',
              background: 'var(--hover-bg)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.99 6.6 2.6" />
              <path d="M21 3v6h-6" />
            </svg>
            Regenerar
          </button>
        )}
      </div>

      {state === 'streaming' && explanation === '' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            color: 'var(--text-muted)',
            fontSize: '0.875rem',
          }}
        >
          <div
            style={{
              width: '16px',
              height: '16px',
              border: '2px solid var(--border)',
              borderTopColor: '#8b5cf6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Generando explicación...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {(state === 'streaming' || state === 'complete') && explanation && (
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: '1.7',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(explanation) }}
        />
      )}

      {state === 'streaming' && explanation && (
        <div
          style={{
            display: 'inline-block',
            width: '8px',
            height: '16px',
            background: '#8b5cf6',
            marginLeft: '2px',
            animation: 'blink 1s step-end infinite',
          }}
        >
          <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        </div>
      )}

      {state === 'error' && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={generateExplanation}
            style={{
              padding: '0.375rem 0.75rem',
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8125rem',
            }}
          >
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
});

BacktestExplanation.displayName = 'BacktestExplanation';

export default BacktestExplanation;
