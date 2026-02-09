import React, { useState, useCallback } from 'react';
import { renderMarkdown } from '../lib/render-markdown';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

type AnalysisState = 'idle' | 'streaming' | 'complete' | 'error';

interface Props {
  strategyId: string;
  existingAnalysis: string | null;
  isOwner: boolean;
}

export default function StrategyAIAnalysis({ strategyId, existingAnalysis, isOwner }: Props) {
  const [state, setState] = useState<AnalysisState>(existingAnalysis ? 'complete' : 'idle');
  const [analysis, setAnalysis] = useState(existingAnalysis || '');
  const [error, setError] = useState<string | null>(null);

  const generateAnalysis = useCallback(async () => {
    setState('streaming');
    setAnalysis('');
    setError(null);

    const token = localStorage.getItem('supabase_token');
    if (!token) {
      setError('No autenticado. Por favor inicia sesión.');
      setState('error');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/strategies/${strategyId}/analyze`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
                setAnalysis((prev) => prev + parsed.text);
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
  }, [strategyId]);

  // Don't render anything if no existing analysis and not owner
  if (!existingAnalysis && !isOwner) {
    return null;
  }

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        className="analysis-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: state === 'idle' ? 0 : '1rem',
          gap: '0.75rem',
        }}
      >
        <div>
          <h3
            style={{
              color: 'var(--text-primary)',
              fontWeight: '600',
              fontSize: '1rem',
              margin: 0,
            }}
          >
            Análisis IA
          </h3>
          {state === 'idle' && (
            <p className="analysis-subtitle" style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: '0.25rem 0 0' }}>
              Genera un análisis estructural de esta estrategia con inteligencia artificial
            </p>
          )}
        </div>

        {state === 'idle' && isOwner && (
          <button
            onClick={generateAnalysis}
            className="analysis-btn"
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
              justifyContent: 'center',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Generar análisis
          </button>
        )}

        <style jsx>{`
          @media (max-width: 768px) {
            .analysis-header {
              flex-direction: column !important;
              align-items: stretch !important;
            }
            .analysis-subtitle {
              display: none !important;
            }
            .analysis-btn {
              width: 100% !important;
            }
          }
        `}</style>

        {state === 'complete' && isOwner && (
          <button
            onClick={generateAnalysis}
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

      {state === 'streaming' && analysis === '' && (
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
          Generando análisis...
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {(state === 'streaming' || state === 'complete') && analysis && (
        <div
          style={{
            color: 'var(--text-secondary)',
            fontSize: '0.9375rem',
            lineHeight: '1.7',
          }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(analysis) }}
        />
      )}

      {state === 'streaming' && analysis && (
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
            onClick={generateAnalysis}
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
}
