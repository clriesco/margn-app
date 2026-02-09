import React, { useState, FormEvent } from "react";
import { useRouter } from "next/router";
import { X, Loader2 } from "lucide-react";
import { createPortfolioFromStrategy } from "../../lib/api";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { NumberInput } from "../NumberInput";
import { parseNumberES } from "../../lib/number-format";

interface CreatePortfolioModalProps {
  strategyId: string;
  strategyName: string;
  defaultContribution?: number;
  onClose: () => void;
}

export default function CreatePortfolioModal({
  strategyId,
  strategyName,
  defaultContribution,
  onClose,
}: CreatePortfolioModalProps) {
  const router = useRouter();
  const { setActivePortfolioId, refreshPortfolios } = usePortfolio();
  const [name, setName] = useState(strategyName);
  const [initialCapital, setInitialCapital] = useState(10000);
  const [monthlyContribution, setMonthlyContribution] = useState(
    defaultContribution ?? 1000
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    if (initialCapital <= 0) {
      setError("El capital inicial debe ser mayor a 0");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const result = await createPortfolioFromStrategy(strategyId, {
        name: name.trim(),
        initialCapital,
        monthlyContribution: monthlyContribution > 0 ? monthlyContribution : undefined,
      });

      // Switch to new portfolio and refresh list
      refreshPortfolios();
      setActivePortfolioId(result.portfolioId);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al crear el portfolio"
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2000,
        padding: "1rem",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              color: "var(--text-primary)",
              fontSize: "1.125rem",
              fontWeight: "600",
              margin: 0,
            }}
          >
            Crear portfolio desde estrategia
          </h2>
          {!isSubmitting && (
            <button
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-dim)",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
              }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  marginBottom: "0.375rem",
                }}
              >
                Nombre del portfolio
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isSubmitting}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "var(--bg-body)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "0.9375rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  marginBottom: "0.375rem",
                }}
              >
                Capital inicial ($)
              </label>
              <NumberInput
                value={initialCapital}
                onChange={setInitialCapital}
                disabled={isSubmitting}
                min={0}
                step={100}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "var(--bg-body)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "0.9375rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  marginBottom: "0.375rem",
                }}
              >
                Aportacion mensual ($)
              </label>
              <NumberInput
                value={monthlyContribution}
                onChange={setMonthlyContribution}
                disabled={isSubmitting}
                min={0}
                step={100}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "var(--bg-body)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-primary)",
                  fontSize: "0.9375rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <p
                style={{
                  color: "var(--accent-red, #ef4444)",
                  fontSize: "0.875rem",
                  margin: 0,
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "1rem 1.5rem",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.75rem",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.625rem 1.25rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
                fontWeight: "500",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                opacity: isSubmitting ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: "0.625rem 1.25rem",
                background: isSubmitting
                  ? "var(--text-dim)"
                  : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {isSubmitting && <Loader2 size={16} className="spin" />}
              {isSubmitting ? "Creando portfolio..." : "Crear portfolio"}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        :global(.spin) {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
