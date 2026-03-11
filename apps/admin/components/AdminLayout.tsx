import React, { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useClerk } from "@clerk/nextjs";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Tag,
  Settings,
  ScrollText,
  LogOut,
  Shield,
} from "lucide-react";

const menuItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Usuarios", icon: Users, path: "/users" },
  { label: "Suscripciones", icon: CreditCard, path: "/subscriptions" },
  { label: "Vouchers", icon: Tag, path: "/vouchers" },
  { label: "Operaciones", icon: Settings, path: "/operations" },
  { label: "Audit Log", icon: ScrollText, path: "/audit-logs" },
];

interface AdminLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const router = useRouter();
  const { signOut } = useClerk();

  const isActive = (path: string) => {
    if (path === "/") return router.pathname === "/";
    return router.pathname.startsWith(path);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f1117" }}>
      {/* Sidebar */}
      <div
        style={{
          width: "240px",
          background: "#161822",
          borderRight: "1px solid #1e2130",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          height: "100vh",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "1.5rem 1.25rem",
            borderBottom: "1px solid #1e2130",
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
          }}
        >
          <Shield size={22} color="#60a5fa" />
          <span
            style={{
              fontSize: "1.125rem",
              fontWeight: 700,
              color: "#e2e8f0",
              letterSpacing: "-0.02em",
            }}
          >
            Margn Admin
          </span>
        </div>

        {/* Navigation */}
        <div style={{ flex: 1, padding: "1rem 0.5rem", overflowY: "auto" }}>
          {menuItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "0.25rem",
                  textDecoration: "none",
                  fontSize: "0.875rem",
                  fontWeight: active ? 600 : 500,
                  color: active ? "#60a5fa" : "#94a3b8",
                  background: active ? "rgba(59, 130, 246, 0.1)" : "transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {React.createElement(item.icon, { size: 18 })}
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #1e2130", padding: "1rem 0.5rem" }}>
          <button
            onClick={() => signOut().then(() => router.push("/"))}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              padding: "0.75rem 1rem",
              borderRadius: "8px",
              background: "transparent",
              color: "#ef4444",
              border: "none",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <LogOut size={18} />
            Cerrar Sesion
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ marginLeft: "240px", flex: 1, padding: "2rem" }}>
        {title && (
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#e2e8f0",
              marginBottom: "1.5rem",
              letterSpacing: "-0.025em",
            }}
          >
            {title}
          </h1>
        )}
        {children}
      </div>
    </div>
  );
}
