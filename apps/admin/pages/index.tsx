import React, { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { getDashboardStats, getDashboardActivity } from "../lib/api";
import { Users, CreditCard, TrendingUp, Briefcase, UserPlus, DollarSign, RefreshCw } from "lucide-react";

interface TimelineEvent {
  type: "signup" | "contribution" | "rebalance";
  email: string;
  date: string;
  detail?: string;
}

const EVENT_CONFIG = {
  signup: { label: "Registro", icon: UserPlus, color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  contribution: { label: "Contribucion", icon: DollarSign, color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  rebalance: { label: "Rebalanceo", icon: RefreshCw, color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
};

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const [s, a] = await Promise.all([getDashboardStats(), getDashboardActivity()]);
        setStats(s);
        setActivity(a);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const timeline = useMemo<TimelineEvent[]>(() => {
    if (!activity) return [];
    const events: TimelineEvent[] = [];

    activity.recentSignups?.forEach((s: any) => {
      events.push({ type: "signup", email: s.email, date: s.createdAt });
    });
    activity.recentContributions?.forEach((c: any) => {
      events.push({
        type: "contribution",
        email: c.portfolio?.user?.email ?? "—",
        date: c.contributedAt,
        detail: `$${Number(c.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      });
    });
    activity.recentRebalances?.forEach((r: any) => {
      events.push({
        type: "rebalance",
        email: r.portfolio?.user?.email ?? "—",
        date: r.createdAt,
        detail: r.triggeredBy === "auto" ? "auto" : "manual",
      });
    });

    events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return events.slice(0, 15);
  }, [activity]);

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <Head><title>Dashboard - Margn Admin</title></Head>
        <p style={{ color: "#94a3b8" }}>Cargando...</p>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Dashboard">
        <Head><title>Dashboard - Margn Admin</title></Head>
        <div style={{ padding: "1rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px" }}>
          <p style={{ color: "#f87171" }}>{error}</p>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { label: "Usuarios", value: stats?.users?.total ?? 0, icon: Users, color: "#60a5fa" },
    { label: "Suscriptores Pro", value: stats?.subscriptions?.pro ?? 0, icon: CreditCard, color: "#a78bfa" },
    { label: "MRR", value: `$${stats?.revenue?.mrr?.toFixed(2) ?? "0.00"}`, icon: TrendingUp, color: "#34d399" },
    { label: "Portfolios", value: stats?.portfolios?.total ?? 0, icon: Briefcase, color: "#fbbf24" },
  ];

  return (
    <AdminLayout title="Dashboard">
      <Head><title>Dashboard - Margn Admin</title></Head>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {statCards.map((card) => (
          <div key={card.label} style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "#94a3b8" }}>{card.label}</span>
              {React.createElement(card.icon, { size: 18, color: card.color })}
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0" }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Activity Timeline */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "1rem" }}>Actividad Reciente</h2>

        {timeline.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {timeline.map((event, i) => {
              const config = EVENT_CONFIG[event.type];
              return (
                <div key={`${event.type}-${i}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.25rem", borderBottom: i < timeline.length - 1 ? "1px solid #1e2130" : "none" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "6px", background: config.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {React.createElement(config.icon, { size: 14, color: config.color })}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.8125rem", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                      {event.email}
                    </span>
                  </div>
                  {event.detail && (
                    <span style={{ fontSize: "0.75rem", color: config.color, fontWeight: 500, flexShrink: 0 }}>
                      {event.detail}
                    </span>
                  )}
                  <span style={{ fontSize: "0.6875rem", color: "#64748b", flexShrink: 0 }}>
                    {formatRelativeDate(event.date)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Sin actividad reciente</p>
        )}
      </div>
    </AdminLayout>
  );
}

function formatRelativeDate(iso: string): string {
  const now = Date.now();
  const date = new Date(iso).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD}d`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
