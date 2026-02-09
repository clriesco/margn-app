import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { ChevronDown, Plus } from "lucide-react";
import { usePortfolio } from "../contexts/PortfolioContext";
import { formatCurrencyES, formatNumberES } from "../lib/number-format";

interface PortfolioSelectorProps {
  isCollapsed: boolean;
}

function getEquity(p: any): number | null {
  return p.latestEquity ?? null;
}

function getLeverage(p: any): number | null {
  const raw = p.latestLeverage as number | null;
  return raw && raw > 0 ? raw : p.leverageTarget ?? null;
}

export default function PortfolioSelector({
  isCollapsed,
}: PortfolioSelectorProps) {
  const router = useRouter();
  const { portfolios, activePortfolioId, setActivePortfolioId } =
    usePortfolio();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = [...portfolios].sort(
    (a, b) =>
      ((b as any).latestEquity ?? 0) - ((a as any).latestEquity ?? 0)
  );

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (sorted.length === 0) return null;

  const active = sorted.find((p) => p.id === activePortfolioId) ?? sorted[0];
  const activeEquity = getEquity(active);
  const activeLeverage = getLeverage(active);

  const handleSelect = (id: string) => {
    setActivePortfolioId(id);
    setIsOpen(false);
  };

  const handleNewPortfolio = () => {
    setIsOpen(false);
    router.push("/dashboard/onboarding");
  };

  // Collapsed sidebar: show only active initial with tooltip
  if (isCollapsed) {
    return (
      <div
        ref={containerRef}
        style={{
          padding: "0.5rem",
          borderBottom: "1px solid var(--border)",
          position: "relative",
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          title={active.name}
          style={{
            width: "100%",
            padding: "0.5rem",
            background: "rgba(59, 130, 246, 0.12)",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "8px",
              background:
                "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "0.8125rem",
              fontWeight: "600",
            }}
          >
            {(active.name || "P")[0].toUpperCase()}
          </div>
        </button>

        {/* Dropdown (collapsed) */}
        {isOpen && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "0.25rem",
              width: "220px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
              zIndex: 100,
              padding: "0.375rem",
              marginTop: "0.25rem",
            }}
          >
            {sorted.map((p) => (
              <DropdownItem
                key={p.id}
                portfolio={p}
                isActive={p.id === activePortfolioId}
                onSelect={() => handleSelect(p.id)}
              />
            ))}
            <NewPortfolioButton onClick={handleNewPortfolio} />
          </div>
        )}
      </div>
    );
  }

  // Expanded sidebar: active portfolio row + dropdown
  return (
    <div
      ref={containerRef}
      style={{
        padding: "0.75rem",
        borderBottom: "1px solid var(--border)",
        position: "relative",
      }}
    >
      {/* Active portfolio trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "0.5rem 0.625rem",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "8px",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          transition: "all 0.15s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              color: "var(--text-primary)",
              fontSize: "0.8125rem",
              fontWeight: "600",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {active.name}
          </div>
          {(activeEquity !== null || activeLeverage !== null) && (
            <div
              style={{
                color: "var(--text-dim)",
                fontSize: "0.6875rem",
                marginTop: "0.0625rem",
                display: "flex",
                gap: "0.375rem",
              }}
            >
              {activeEquity !== null && (
                <span>
                  {formatCurrencyES(activeEquity, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              )}
              {activeLeverage !== null && (
                <span>
                  {formatNumberES(activeLeverage, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  x
                </span>
              )}
            </div>
          )}
        </div>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-dim)",
            flexShrink: 0,
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0.5rem",
            right: "0.5rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            zIndex: 100,
            padding: "0.375rem",
            marginTop: "0.25rem",
            maxHeight: "280px",
            overflowY: "auto",
          }}
        >
          {sorted.map((p) => (
            <DropdownItem
              key={p.id}
              portfolio={p}
              isActive={p.id === activePortfolioId}
              onSelect={() => handleSelect(p.id)}
            />
          ))}
          <NewPortfolioButton onClick={handleNewPortfolio} />
        </div>
      )}
    </div>
  );
}

/* ── Dropdown item ── */

function DropdownItem({
  portfolio,
  isActive,
  onSelect,
}: {
  portfolio: any;
  isActive: boolean;
  onSelect: () => void;
}) {
  const equity = getEquity(portfolio);
  const leverage = getLeverage(portfolio);

  return (
    <button
      onClick={onSelect}
      style={{
        width: "100%",
        padding: "0.5rem 0.625rem",
        background: isActive ? "rgba(59, 130, 246, 0.1)" : "transparent",
        border: "none",
        borderLeft: isActive
          ? "2px solid #3b82f6"
          : "2px solid transparent",
        borderRadius: "4px",
        cursor: "pointer",
        textAlign: "left",
        transition: "background 0.1s ease",
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          color: isActive ? "#60a5fa" : "var(--text-primary)",
          fontSize: "0.8125rem",
          fontWeight: isActive ? "600" : "500",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {portfolio.name}
      </div>
      {(equity !== null || leverage !== null) && (
        <div
          style={{
            color: "var(--text-dim)",
            fontSize: "0.6875rem",
            marginTop: "0.0625rem",
            display: "flex",
            gap: "0.375rem",
          }}
        >
          {equity !== null && (
            <span>
              {formatCurrencyES(equity, { maximumFractionDigits: 0 })}
            </span>
          )}
          {leverage !== null && (
            <span>
              {formatNumberES(leverage, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
              x
            </span>
          )}
        </div>
      )}
    </button>
  );
}

/* ── New portfolio button ── */

function NewPortfolioButton({ onClick }: { onClick: () => void }) {
  return (
    <>
      <div
        style={{
          height: "1px",
          background: "var(--border)",
          margin: "0.25rem 0",
        }}
      />
      <button
        onClick={onClick}
        style={{
          width: "100%",
          padding: "0.5rem 0.625rem",
          background: "transparent",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: "0.375rem",
          color: "var(--text-dim)",
          fontSize: "0.8125rem",
          transition: "all 0.1s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--hover-bg)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-dim)";
        }}
      >
        <Plus size={14} />
        <span>Nuevo portfolio</span>
      </button>
    </>
  );
}
