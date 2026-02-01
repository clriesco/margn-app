import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

export function Tooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '0.375rem' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: open ? '#60a5fa' : '#475569', display: 'flex', alignItems: 'center',
          transition: 'color 0.15s',
        }}
        tabIndex={-1}
      >
        <HelpCircle size={14} />
      </button>
      {open && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
          width: '280px', padding: '0.625rem 0.75rem',
          background: 'var(--border)', border: '1px solid var(--input-border)', borderRadius: '6px',
          color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: '1.5',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)', zIndex: 100, pointerEvents: 'none',
          whiteSpace: 'pre-wrap',
        }}>
          {text}
          {/* Arrow */}
          <span style={{
            position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
            borderTop: '6px solid var(--input-border)',
          }} />
        </span>
      )}
    </span>
  );
}
