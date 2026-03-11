import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 9999, display: "flex", flexDirection: "column", gap: "0.5rem", pointerEvents: "none" }}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const typeConfig = {
  success: { icon: CheckCircle, color: "#34d399", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
  error: { icon: AlertCircle, color: "#f87171", bg: "rgba(248,113,113,0.15)", border: "rgba(248,113,113,0.3)" },
  info: { icon: Info, color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.3)" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    // Enter animation
    requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(toast.id), 300);
    }, toast.type === "error" ? 5000 : 3000);
    return () => clearTimeout(timerRef.current);
  }, [toast.id, toast.type, onDismiss]);

  const handleDismiss = () => {
    clearTimeout(timerRef.current);
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  const config = typeConfig[toast.type];
  const Icon = config.icon;

  return (
    <div
      role="alert"
      style={{
        display: "flex", alignItems: "center", gap: "0.625rem",
        padding: "0.75rem 1rem", minWidth: "280px", maxWidth: "420px",
        background: config.bg, backdropFilter: "blur(12px)",
        border: `1px solid ${config.border}`, borderRadius: "10px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        pointerEvents: "auto",
        transform: visible && !exiting ? "translateX(0)" : "translateX(calc(100% + 1rem))",
        opacity: visible && !exiting ? 1 : 0,
        transition: "transform 0.3s ease, opacity 0.3s ease",
      }}
    >
      <Icon size={16} color={config.color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "0.8125rem", color: "#e2e8f0", flex: 1 }}>{toast.message}</span>
      <button onClick={handleDismiss} aria-label="Cerrar"
        style={{ background: "none", border: "none", padding: "0.125rem", cursor: "pointer", flexShrink: 0, display: "flex" }}>
        <X size={14} color="#64748b" />
      </button>
    </div>
  );
}
