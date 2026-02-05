import React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import type { PublicStrategySummary } from "../lib/api";

const RISK_PROFILE_LABELS: Record<string, string> = {
  conservative: "Conservador",
  moderate: "Moderado",
  growth: "Crecimiento",
  aggressive: "Agresivo",
};

const RISK_PROFILE_COLORS: Record<string, string> = {
  conservative: "#22c55e",
  moderate: "#3b82f6",
  growth: "#f59e0b",
  aggressive: "#ef4444",
};

function getWeightModeLabel(weightMode?: string, dynamicWeights?: boolean) {
  if (weightMode === "sharpe") {
    return dynamicWeights ? "Sharpe+" : "Sharpe";
  }
  if (weightMode === "equal") return "Iguales";
  return "Manual";
}

interface StrategyCardProps {
  strategy: PublicStrategySummary;
  selected?: boolean;
  onSelect?: () => void;
  onApply?: () => void;
  compact?: boolean;
  /** Link to strategy detail page */
  href?: string;
  /** Owner actions */
  isPublic?: boolean;
  onToggleVisibility?: () => void;
  isTogglingVisibility?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
  hideRiskBadge?: boolean;
}

export function StrategyCard({
  strategy,
  selected = false,
  onSelect,
  onApply,
  compact = false,
  href,
  isPublic,
  onToggleVisibility,
  isTogglingVisibility = false,
  onDelete,
  isDeleting = false,
  hideRiskBadge = false,
}: StrategyCardProps) {
  const riskColor =
    RISK_PROFILE_COLORS[strategy.riskProfileId || ""] || "var(--text-muted)";
  const riskLabel =
    RISK_PROFILE_LABELS[strategy.riskProfileId || ""] || null;
  const symbols = Object.keys(strategy.config.weights);
  return (
    <div
      onClick={onSelect}
      style={{
        padding: compact ? "0.875rem" : "1.25rem",
        border: `1px solid ${selected ? "#3b82f6" : "var(--border)"}`,
        borderRadius: "12px",
        background: selected
          ? "rgba(59, 130, 246, 0.08)"
          : "var(--bg-card)",
        cursor: onSelect ? "pointer" : "default",
        transition: "all 0.2s",
        position: "relative",
      }}
    >
      {/* Selected indicator */}
      {selected && (
        <div
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: "#3b82f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
          }}
        >
          <Check size={14} />
        </div>
      )}

      {/* Tags row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          marginBottom: "0.375rem",
        }}
      >
        {riskLabel && !hideRiskBadge && (
          <span
            style={{
              flex: 1,
              textAlign: "center",
              padding: "0.125rem 0.5rem",
              background: `${riskColor}15`,
              color: riskColor,
              borderRadius: "999px",
              fontSize: "0.6875rem",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {riskLabel}
          </span>
        )}
        <span
          style={{
            flex: 1,
            textAlign: "center",
            padding: "0.125rem 0.5rem",
            background: "var(--hover-bg)",
            borderRadius: "999px",
            fontSize: "0.6875rem",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {strategy.config.leverageTarget}x
        </span>
        <span
          style={{
            flex: 1,
            textAlign: "center",
            padding: "0.125rem 0.5rem",
            background: "var(--hover-bg)",
            borderRadius: "999px",
            fontSize: "0.6875rem",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {getWeightModeLabel(
            strategy.config.weightMode,
            strategy.config.dynamicWeights,
          )}
        </span>
        {onToggleVisibility && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            disabled={isTogglingVisibility}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "0.125rem 0.5rem",
              background: isPublic
                ? "rgba(16, 185, 129, 0.1)"
                : "var(--hover-bg)",
              border: `1px solid ${isPublic ? "rgba(16, 185, 129, 0.3)" : "var(--border)"}`,
              borderRadius: "999px",
              fontSize: "0.6875rem",
              fontWeight: 500,
              color: isPublic ? "#10b981" : "var(--text-muted)",
              cursor: isTogglingVisibility ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isPublic ? "Pública" : "Privada"}
          </button>
        )}
      </div>

      {/* Title */}
      {href && !onSelect ? (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "block",
            margin: "0 0 0.375rem 0",
            fontSize: compact ? "0.9375rem" : "1.0625rem",
            fontWeight: 600,
            color: "var(--text-primary)",
            textDecoration: "none",
          }}
        >
          {strategy.name}
        </Link>
      ) : (
        <h3
          style={{
            margin: "0 0 0.375rem 0",
            fontSize: compact ? "0.9375rem" : "1.0625rem",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {strategy.name}
        </h3>
      )}

      {/* Description */}
      {strategy.description && (
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8125rem",
            margin: "0 0 0.75rem 0",
            lineHeight: 1.4,
          }}
        >
          {strategy.description}
        </p>
      )}

      {/* Author */}
      {strategy.authorName && (
        <p
          style={{
            color: "var(--text-dim)",
            fontSize: "0.75rem",
            margin: "0 0 0.5rem 0",
          }}
        >
          por {strategy.authorName}
        </p>
      )}

      {/* Asset chips with weights */}
      <div
        style={{
          display: "flex",
          gap: "0.375rem",
          flexWrap: "wrap",
          marginBottom: strategy.metrics && !compact ? "0.75rem" : 0,
        }}
      >
        {symbols.map((symbol) => (
          <span
            key={symbol}
            style={{
              padding: "0.1875rem 0.5rem",
              background: "var(--hover-bg)",
              border: "1px solid var(--border-light)",
              borderRadius: "4px",
              fontSize: "0.75rem",
              color: "var(--text-secondary)",
            }}
          >
            {symbol}:{" "}
            {(strategy.config.weights[symbol] * 100).toFixed(0)}%
          </span>
        ))}
      </div>

      {/* Metrics (if available, not in compact mode) */}
      {strategy.metrics && !compact && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            padding: "0.5rem 0 0 0",
            borderTop: "1px solid var(--border)",
            marginTop: "0.75rem",
          }}
        >
          <div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-dim)" }}>
              CAGR
            </span>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color:
                  strategy.metrics.p50.cagr >= 0 ? "#34d399" : "#f87171",
              }}
            >
              {(strategy.metrics.p50.cagr * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-dim)" }}>
              Sharpe
            </span>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              {strategy.metrics.p50.sharpe.toFixed(2)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: "0.6875rem", color: "var(--text-dim)" }}>
              Max DD
            </span>
            <div
              style={{
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "#f87171",
              }}
            >
              {(strategy.metrics.p50.maxDrawdownEquity * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {!onSelect && (href || onApply || onDelete) && (
        <div
          style={{
            marginTop: "0.75rem",
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
          }}
        >
          {href && (
            <Link
              href={href}
              onClick={(e) => e.stopPropagation()}
              style={{
                padding: "0.5rem 1rem",
                background: "transparent",
                color: "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "0.8125rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Ver detalle
            </Link>
          )}
          {onApply && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApply();
              }}
              style={{
                padding: "0.5rem 1rem",
                background:
                  "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "0.8125rem",
                fontWeight: 500,
              }}
            >
              Aplicar a mi portfolio
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={isDeleting}
              style={{
                marginLeft: "auto",
                padding: "0.375rem 0.75rem",
                background: "transparent",
                color: isDeleting ? "var(--text-muted)" : "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "6px",
                cursor: isDeleting ? "not-allowed" : "pointer",
                fontSize: "0.8125rem",
              }}
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default StrategyCard;
