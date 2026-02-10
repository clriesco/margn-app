import React from "react";

/**
 * Contextual legal disclaimer component
 * Used inline in pages to provide regulatory-compliant context
 */
export function LegalDisclaimer({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        padding: compact ? "0.625rem 0.875rem" : "0.75rem 1rem",
        background: "rgba(148, 163, 184, 0.06)",
        borderRadius: "8px",
        border: "1px solid rgba(148, 163, 184, 0.12)",
        fontSize: compact ? "0.75rem" : "0.8125rem",
        color: "var(--text-dim)",
        lineHeight: "1.5",
      }}
    >
      {text}
    </div>
  );
}
