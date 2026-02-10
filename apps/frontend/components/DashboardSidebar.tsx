import React, { useState, ReactNode, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  DollarSign,
  Scale,
  RefreshCw,
  Settings,
  User,
  LogOut,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Menu,
  X,
  BarChart3,
  Sun,
  Moon,
  Bookmark,
} from "lucide-react";
import { usePortfolio } from "../contexts/PortfolioContext";
import { useTheme } from "../contexts/ThemeContext";
import PortfolioSelector from "./PortfolioSelector";
import TopBar from "./TopBar";

/**
 * Hook to detect screen size
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }
    const listener = () => setMatches(media.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [matches, query]);

  return matches;
}

/**
 * Dashboard Sidebar Component
 * Collapsible sidebar menu for dashboard navigation
 * Responsive: drawer on mobile, sidebar on desktop
 */
interface DashboardSidebarProps {
  children: ReactNode;
}

export default function DashboardSidebar({
  children,
}: DashboardSidebarProps) {
  const router = useRouter();
  const { signOut } = useClerk();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const { theme, toggleTheme } = useTheme();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 768px)");
  const isTablet = useMediaQuery("(min-width: 769px) and (max-width: 1024px)");

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
      color: "#60a5fa",
    },
    {
      label: "Movimientos",
      icon: DollarSign,
      path: "/dashboard/contribution",
      color: "#34d399",
    },
    {
      label: "Simulador",
      icon: Scale,
      path: "/dashboard/rebalance",
      color: "#a5b4fc",
    },
    {
      label: "Sincronizar Posiciones",
      icon: RefreshCw,
      path: "/dashboard/manual-update",
      color: "#fbbf24",
    },
    {
      label: "Backtest",
      icon: BarChart3,
      path: "/dashboard/backtest",
      color: "#f59e0b",
    },
    {
      label: "Estrategias",
      icon: Bookmark,
      path: "/dashboard/strategies",
      color: "#8b5cf6",
    },
    {
      label: "Configuración",
      icon: Settings,
      path: "/dashboard/configuration",
      color: "#94a3b8",
    },
    {
      label: "Mi Perfil",
      icon: User,
      path: "/dashboard/profile",
      color: "#c084fc",
    },
    {
      label: "Ayuda",
      icon: BookOpen,
      path: "/dashboard/help",
      color: "#60a5fa",
    },
  ];

  const isActive = (path: string) => {
    return router.pathname === path;
  };

  // Auto-collapse sidebar on tablet sizes to prevent content cutoff
  // Only auto-collapse when entering tablet range, not when user manually expands
  const [userManuallyToggled, setUserManuallyToggled] = useState(false);
  const prevTabletRef = useRef<boolean | null>(null);
  
  useEffect(() => {
    // Initialize on mount
    if (prevTabletRef.current === null) {
      prevTabletRef.current = isTablet;
      return;
    }
    
    // Only auto-collapse when transitioning from desktop (false) to tablet (true)
    if (isTablet && !isMobile && prevTabletRef.current === false && !userManuallyToggled) {
      setIsCollapsed(true);
    }
    
    // Update previous state
    prevTabletRef.current = isTablet;
    
    // Reset manual toggle flag when leaving tablet range
    if (!isTablet && userManuallyToggled) {
      setUserManuallyToggled(false);
    }
  }, [isTablet, isMobile, userManuallyToggled]);

  // Close mobile menu when route changes
  useEffect(() => {
    const handleRouteChange = () => {
      if (isMobile) {
        setIsMobileMenuOpen(false);
      }
    };
    router.events?.on("routeChangeComplete", handleRouteChange);
    return () => {
      router.events?.off("routeChangeComplete", handleRouteChange);
    };
  }, [router, isMobile]);

  // Handle navigation with mobile menu close
  const handleNavigation = (path: string) => {
    const fullPath =
      path === "/dashboard"
        ? `${path}?portfolioId=${portfolioId}`
        : `${path}?portfolioId=${portfolioId}`;
    router.push(fullPath);
    if (isMobile) {
      setIsMobileMenuOpen(false);
    }
  };

  const sidebarWidth = isMobile ? "280px" : isCollapsed ? "70px" : "260px";
  const sidebarStyle: React.CSSProperties = {
    width: sidebarWidth,
    background: "var(--bg-sidebar)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    transition: "transform 0.3s ease, width 0.2s ease",
    position: "fixed",
    height: "100vh",
    zIndex: isMobile ? 1000 : 10,
    top: 0,
    left: 0,
    ...(isMobile && {
      transform: isMobileMenuOpen ? "translateX(0)" : "translateX(-100%)",
      boxShadow: isMobileMenuOpen ? "4px 0 24px rgba(0, 0, 0, 0.5)" : "none",
    }),
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Mobile Menu Overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            zIndex: 999,
          }}
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Button */}
      {isMobile && (
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          style={{
            position: "fixed",
            top: "1rem",
            left: "1rem",
            zIndex: 1001,
            padding: "0.625rem",
            background: "var(--bg-card)",
            border: "1px solid var(--border-light)",
            borderRadius: "8px",
            color: "var(--text-secondary)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
          }}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      )}

      {/* Sidebar */}
      <div style={sidebarStyle}>
        {/* Logo / Header */}
        <div
          style={{
            padding: isCollapsed ? "1.5rem 0.75rem" : "1.5rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: isCollapsed ? "center" : "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
            }}
          >
            {isCollapsed && !isMobile ? (
              <TrendingUp size={24} color="var(--accent-blue-light)" />
            ) : (
              <a
                href={`/dashboard${portfolioId ? `?portfolioId=${portfolioId}` : ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/dashboard${portfolioId ? `?portfolioId=${portfolioId}` : ""}`);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                <Image
                  src={theme === "dark" ? "/margn-logo-white.png" : "/margn-logo.png"}
                  alt="Margn"
                  width={145}
                  height={38}
                  priority
                />
              </a>
            )}
          </div>
        </div>

        {/* Portfolio Selector */}
        <PortfolioSelector isCollapsed={isCollapsed && !isMobile} />

        {/* Navigation Items */}
        <div
          style={{
            flex: 1,
            padding: "1rem 0.5rem",
            overflowY: "auto",
          }}
        >
          {menuItems.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                style={{
                  width: "100%",
                  padding: isCollapsed ? "0.875rem 0.5rem" : "0.875rem 1rem",
                  background: active
                    ? "rgba(59, 130, 246, 0.1)"
                    : "transparent",
                  color: active ? "#60a5fa" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "8px",
                  textAlign: "left",
                  fontSize: "0.9375rem",
                  fontWeight: active ? "600" : "500",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.875rem",
                  marginBottom: "0.25rem",
                  transition: "all 0.15s ease",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background =
                      "var(--hover-bg)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {React.createElement(item.icon, {
                  size: 20,
                  style: { flexShrink: 0 },
                })}
                {!isCollapsed && <span>{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Footer: Collapse button and Sign Out */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "1rem 0.5rem",
          }}
        >
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            style={{
              width: "100%",
              padding: isCollapsed ? "0.875rem 0.5rem" : "0.875rem 1rem",
              background: "transparent",
              color: "var(--text-dim)",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.9375rem",
              fontWeight: "500",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              marginBottom: "0.25rem",
              transition: "all 0.15s ease",
              justifyContent: isCollapsed ? "center" : "flex-start",
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
            {theme === "dark" ? (
              <Sun size={20} style={{ flexShrink: 0 }} />
            ) : (
              <Moon size={20} style={{ flexShrink: 0 }} />
            )}
            {!isCollapsed && (
              <span>{theme === "dark" ? "Tema claro" : "Tema oscuro"}</span>
            )}
          </button>

          {/* Collapse Button - Only show on desktop */}
          {!isMobile && (
            <button
              onClick={() => {
                setIsCollapsed(!isCollapsed);
                // Mark that user manually toggled to prevent auto-collapse
                if (isTablet) {
                  setUserManuallyToggled(true);
                }
              }}
              style={{
                width: "100%",
                padding: isCollapsed ? "0.875rem 0.5rem" : "0.875rem 1rem",
                background: "transparent",
                color: "var(--text-dim)",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.9375rem",
                fontWeight: "500",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.875rem",
                marginBottom: "0.25rem",
                transition: "all 0.15s ease",
                justifyContent: isCollapsed ? "center" : "flex-start",
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
              {isCollapsed ? (
                <ChevronRight size={20} style={{ flexShrink: 0 }} />
              ) : (
                <ChevronLeft size={20} style={{ flexShrink: 0 }} />
              )}
              {!isCollapsed && <span>Colapsar</span>}
            </button>
          )}

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            style={{
              width: "100%",
              padding: isCollapsed ? "0.875rem 0.5rem" : "0.875rem 1rem",
              background: "transparent",
              color: "var(--accent-red)",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.9375rem",
              fontWeight: "500",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              transition: "all 0.15s ease",
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "#ef4444";
            }}
          >
            <LogOut size={20} style={{ flexShrink: 0 }} />
            {!isCollapsed && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </div>

      {/* Top Bar */}
      <TopBar
        isMobile={isMobile}
        sidebarCollapsed={isCollapsed}
      />

      {/* Main Content */}
      <div
        style={{
          marginLeft: isMobile ? "0" : isCollapsed ? "70px" : "260px",
          marginTop: "56px",
          flex: 1,
          transition: "margin-left 0.2s ease",
          minHeight: "calc(100vh - 56px)",
          width: isMobile ? "100%" : "auto",
          overflowX: "hidden",
        }}
        className="main-content-wrapper"
      >
        {children}
        <footer
          style={{
            padding: "1.5rem 2rem",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "0.375rem",
            fontSize: "0.75rem",
            color: "var(--text-dim)",
          }}
        >
          <span style={{ textAlign: "center" }}>
            Margn es una herramienta de cálculo y visualización. No constituye asesoramiento financiero.
          </span>
          <span>&copy; {new Date().getFullYear()} Margn</span>
          <span>·</span>
          <Link
            href="/terms"
            style={{
              color: "var(--text-dim)",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Términos y Condiciones
          </Link>
        </footer>
      </div>

      {/* Responsive styles */}
      <style jsx>{`
        @media (max-width: 768px) {
          /* Ensure content is full width on mobile */
          :global(body) {
            overflow-x: hidden;
          }
          .main-content-wrapper {
            max-width: 100% !important;
            margin-left: 0 !important;
          }
        }
        @media (min-width: 769px) and (max-width: 1023px) {
          .main-content-wrapper {
            max-width: calc(100vw - 70px) !important;
          }
        }
      `}</style>
    </div>
  );
}



