import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import useSWR from "swr";
import { useAuth } from "../contexts/AuthContext";
import { usePortfolioSummary } from "../lib/hooks/use-portfolio-data";
import { getProfile, UserProfile } from "../lib/api";
import { User, Settings, LogOut, ChevronDown } from "lucide-react";
import { formatCurrencyES } from "../lib/number-format";

interface TopBarProps {
  portfolioId: string | null;
  isMobile?: boolean;
  sidebarCollapsed?: boolean;
}

export default function TopBar({
  portfolioId,
  isMobile = false,
  sidebarCollapsed = false,
}: TopBarProps) {
  const { summary } = usePortfolioSummary(portfolioId);
  const equity = summary?.metrics?.equity;
  const exposure = summary?.metrics?.exposure;
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch user profile for avatar
  const { data: profile } = useSWR<UserProfile>(
    user ? "profile" : null,
    () => getProfile(),
    { revalidateOnFocus: false }
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleNavigation = (path: string) => {
    const fullPath = portfolioId ? `${path}?portfolioId=${portfolioId}` : path;
    router.push(fullPath);
    setDropdownOpen(false);
  };

  // Get user initials or first letter of email
  const getInitials = () => {
    if (profile?.fullName) {
      const names = profile.fullName.split(" ");
      return names.map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (user?.user_metadata?.full_name) {
      const names = user.user_metadata.full_name.split(" ");
      return names.map((n: string) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: isMobile ? 0 : sidebarCollapsed ? "70px" : "260px",
        right: 0,
        height: "56px",
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        padding: "0 1.5rem",
        gap: "1.5rem",
        zIndex: 100,
        transition: "left 0.2s ease",
      }}
    >
      {/* Spacer to push content to the right */}
      <div style={{ flex: 1 }} />

      {/* Metrics summary */}
      {equity !== undefined && exposure !== undefined && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "0.8125rem" }}>
              Equity
            </span>
            <span
              style={{
                color: "var(--text-primary)",
                fontSize: "0.9375rem",
                fontWeight: "600",
              }}
            >
              {formatCurrencyES(equity, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--text-dim)", fontSize: "0.8125rem" }}>
              Exposición
            </span>
            <span
              style={{
                color: "var(--text-primary)",
                fontSize: "0.9375rem",
                fontWeight: "600",
              }}
            >
              {formatCurrencyES(exposure, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </div>
      )}

      {/* User dropdown */}
      <div ref={dropdownRef} style={{ position: "relative" }}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.375rem 0.625rem",
            background: dropdownOpen ? "var(--hover-bg)" : "transparent",
            border: "1px solid transparent",
            borderRadius: "8px",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!dropdownOpen) {
              e.currentTarget.style.background = "var(--hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (!dropdownOpen) {
              e.currentTarget.style.background = "transparent";
            }
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              background: profile?.avatarUrl
                ? `url(${profile.avatarUrl}) center/cover no-repeat`
                : "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "0.8125rem",
              fontWeight: "600",
            }}
          >
            {!profile?.avatarUrl && getInitials()}
          </div>
          <ChevronDown
            size={16}
            style={{
              color: "var(--text-dim)",
              transform: dropdownOpen ? "rotate(180deg)" : "rotate(0)",
              transition: "transform 0.2s",
            }}
          />
        </button>

        {/* Dropdown menu */}
        {dropdownOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 0.5rem)",
              right: 0,
              minWidth: "180px",
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              overflow: "hidden",
              zIndex: 1000,
            }}
          >
            {/* User info */}
            <div
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  color: "var(--text-primary)",
                  fontSize: "0.875rem",
                  fontWeight: "600",
                }}
              >
                {profile?.fullName || user?.user_metadata?.full_name || "Usuario"}
              </div>
              <div
                style={{
                  color: "var(--text-dim)",
                  fontSize: "0.75rem",
                  marginTop: "0.125rem",
                }}
              >
                {user?.email}
              </div>
            </div>

            {/* Menu items */}
            <div style={{ padding: "0.5rem" }}>
              <button
                onClick={() => handleNavigation("/dashboard/profile")}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "6px",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--hover-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <User size={16} />
                Mi Perfil
              </button>
              <button
                onClick={() => handleNavigation("/dashboard/configuration")}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "6px",
                  color: "var(--text-secondary)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--hover-bg)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }}
              >
                <Settings size={16} />
                Configuración
              </button>
            </div>

            {/* Sign out */}
            <div
              style={{
                padding: "0.5rem",
                borderTop: "1px solid var(--border)",
              }}
            >
              <button
                onClick={handleSignOut}
                style={{
                  width: "100%",
                  padding: "0.625rem 0.75rem",
                  background: "transparent",
                  border: "none",
                  borderRadius: "6px",
                  color: "var(--accent-red)",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.625rem",
                  textAlign: "left",
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                  e.currentTarget.style.color = "#f87171";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--accent-red)";
                }}
              >
                <LogOut size={16} />
                Cerrar Sesión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
