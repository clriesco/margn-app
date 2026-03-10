import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import AdminLayout from "../components/AdminLayout";
import { getSubscriptions } from "../lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TIERS = ["", "starter", "pro", "institutional"];
const STATUSES = ["", "active", "trialing", "past_due", "canceled"];

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [tier, setTier] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getSubscriptions({ tier: tier || undefined, status: status || undefined, page, limit });
        setSubs(data.subscriptions || data);
        setTotal(data.total || 0);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
  }, [tier, status, page]);

  const totalPages = Math.ceil(total / limit);
  const selectStyle: React.CSSProperties = {
    padding: "0.5rem 0.75rem", background: "#161822", color: "#e2e8f0",
    border: "1px solid #1e2130", borderRadius: "8px", fontSize: "0.8125rem", outline: "none",
  };

  return (
    <AdminLayout title="Suscripciones">
      <Head><title>Suscripciones - Margn Admin</title></Head>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
        <select value={tier} onChange={(e) => { setTier(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">Todos los tiers</option>
          {TIERS.filter(Boolean).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">Todos los estados</option>
          {STATUSES.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Usuario", "Tier", "Estado", "Período", "Cancel"].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Cargando...</td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Sin resultados</td></tr>
            ) : (
              subs.map((sub: any) => (
                <tr key={sub.id} style={{ borderBottom: "1px solid #1e2130" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <Link href={`/users/${sub.userId}`} style={{ color: "#60a5fa" }}>{sub.user?.email || sub.userId}</Link>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>{sub.tier}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
                      background: sub.status === "active" ? "rgba(16,185,129,0.1)" : sub.status === "trialing" ? "rgba(59,130,246,0.1)" : "rgba(248,113,113,0.1)",
                      color: sub.status === "active" ? "#34d399" : sub.status === "trialing" ? "#60a5fa" : "#f87171",
                    }}>{sub.status}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>
                    {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: sub.cancelAtPeriodEnd ? "#f87171" : "#64748b" }}>
                    {sub.cancelAtPeriodEnd ? "Sí" : "No"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1rem", marginTop: "1.5rem" }}>
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1}
            style={{ padding: "0.5rem", background: "#161822", border: "1px solid #1e2130", borderRadius: "6px", color: page <= 1 ? "#334155" : "#94a3b8", cursor: page <= 1 ? "default" : "pointer" }}>
            <ChevronLeft size={16} />
          </button>
          <span style={{ color: "#94a3b8", fontSize: "0.8125rem" }}>Página {page} de {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}
            style={{ padding: "0.5rem", background: "#161822", border: "1px solid #1e2130", borderRadius: "6px", color: page >= totalPages ? "#334155" : "#94a3b8", cursor: page >= totalPages ? "default" : "pointer" }}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </AdminLayout>
  );
}
