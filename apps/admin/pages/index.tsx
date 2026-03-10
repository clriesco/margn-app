import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { getDashboardStats, getDashboardActivity } from "../lib/api";
import { Users, CreditCard, TrendingUp, Briefcase } from "lucide-react";

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
    { label: "Usuarios", value: stats?.totalUsers ?? 0, icon: Users, color: "#60a5fa" },
    { label: "Suscriptores Pro", value: stats?.proSubscribers ?? 0, icon: CreditCard, color: "#a78bfa" },
    { label: "MRR", value: `€${stats?.mrr?.toFixed(2) ?? "0.00"}`, icon: TrendingUp, color: "#34d399" },
    { label: "Portfolios", value: stats?.totalPortfolios ?? 0, icon: Briefcase, color: "#fbbf24" },
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

      {/* Recent Activity */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.5rem" }}>
        <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "1rem" }}>Actividad Reciente</h2>
        {activity?.recentSignups?.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {activity.recentSignups.slice(0, 10).map((item: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #1e2130", fontSize: "0.8125rem" }}>
                <span style={{ color: "#e2e8f0" }}>{item.email}</span>
                <span style={{ color: "#64748b" }}>{new Date(item.createdAt).toLocaleDateString("es-ES")}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: "#64748b", fontSize: "0.875rem" }}>Sin actividad reciente</p>
        )}
      </div>
    </AdminLayout>
  );
}
