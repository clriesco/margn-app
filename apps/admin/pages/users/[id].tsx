import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AdminLayout from "../../components/AdminLayout";
import { getUser, updateUserRole, banUser, unbanUser, overrideTier, extendTrial, grantComplimentary } from "../../lib/api";
import { ArrowLeft, Shield, Ban, Gift, Clock } from "lucide-react";

export default function UserDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const data = await getUser(id as string);
        setUser(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleAction = async (action: string, fn: () => Promise<any>) => {
    setActionLoading(action);
    setMessage("");
    setError("");
    try {
      await fn();
      const data = await getUser(id as string);
      setUser(data);
      setMessage(`Acción "${action}" completada.`);
      setTimeout(() => setMessage(""), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return <AdminLayout title="Usuario"><Head><title>Usuario - Margn Admin</title></Head><p style={{ color: "#94a3b8" }}>Cargando...</p></AdminLayout>;
  }

  if (!user) {
    return <AdminLayout title="Usuario"><Head><title>Usuario - Margn Admin</title></Head><p style={{ color: "#f87171" }}>{error || "Usuario no encontrado"}</p></AdminLayout>;
  }

  const cardStyle: React.CSSProperties = { background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.5rem", marginBottom: "1rem" };
  const btnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
    padding: "0.5rem 1rem", background: disabled ? "#1e2130" : `rgba(${color}, 0.1)`,
    color: disabled ? "#334155" : `rgb(${color})`, border: `1px solid rgba(${color}, 0.3)`,
    borderRadius: "8px", fontSize: "0.8125rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex", alignItems: "center", gap: "0.375rem",
  });

  return (
    <AdminLayout>
      <Head><title>{user.email} - Margn Admin</title></Head>

      <button onClick={() => router.push("/users")} style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: "#60a5fa", background: "none", border: "none", fontSize: "0.875rem", marginBottom: "1.5rem", cursor: "pointer" }}>
        <ArrowLeft size={16} /> Volver a usuarios
      </button>

      <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "1.5rem" }}>{user.email}</h1>

      {message && <div style={{ padding: "0.75rem 1rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#34d399", fontSize: "0.8125rem" }}>{message}</div>}
      {error && <div style={{ padding: "0.75rem 1rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#f87171", fontSize: "0.8125rem" }}>{error}</div>}

      {/* User Info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "1rem" }}>Información</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8125rem" }}>
          <div><span style={{ color: "#64748b" }}>Nombre:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{user.fullName || "—"}</span></div>
          <div><span style={{ color: "#64748b" }}>Email:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{user.email}</span></div>
          <div><span style={{ color: "#64748b" }}>Rol:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{user.role}</span></div>
          <div><span style={{ color: "#64748b" }}>Registrado:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{new Date(user.createdAt).toLocaleDateString("es-ES")}</span></div>
          {user.bannedAt && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#f87171" }}>Baneado: {user.banReason || "Sin razón"}</span></div>}
        </div>
      </div>

      {/* Subscription */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "1rem" }}>Suscripción</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", fontSize: "0.8125rem", marginBottom: "1.25rem" }}>
          <div><span style={{ color: "#64748b" }}>Tier:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{user.subscription?.tier || "starter"}</span></div>
          <div><span style={{ color: "#64748b" }}>Estado:</span> <span style={{ color: "#e2e8f0", marginLeft: "0.5rem" }}>{user.subscription?.status || "—"}</span></div>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button style={btnStyle("96,165,250", actionLoading === "role")} disabled={!!actionLoading}
            onClick={() => handleAction("role", () => updateUserRole(user.id, user.role === "admin" ? "user" : "admin"))}>
            <Shield size={14} /> {user.role === "admin" ? "Quitar Admin" : "Hacer Admin"}
          </button>
          <button style={btnStyle("168,85,247", actionLoading === "tier")} disabled={!!actionLoading}
            onClick={() => {
              const tier = prompt("Nuevo tier (starter, pro, institutional):", user.subscription?.tier || "starter");
              if (tier) handleAction("tier", () => overrideTier(user.id, tier));
            }}>
            <Gift size={14} /> Override Tier
          </button>
          <button style={btnStyle("251,191,36", actionLoading === "trial")} disabled={!!actionLoading}
            onClick={() => {
              const days = prompt("Días adicionales de trial:", "14");
              if (days) handleAction("trial", () => extendTrial(user.id, parseInt(days)));
            }}>
            <Clock size={14} /> Extender Trial
          </button>
          <button style={btnStyle("168,85,247", actionLoading === "comp")} disabled={!!actionLoading}
            onClick={() => {
              const tier = prompt("Tier complimentary (pro, institutional):", "pro");
              if (tier) handleAction("comp", () => grantComplimentary(user.id, tier));
            }}>
            <Gift size={14} /> Complimentary
          </button>
          {user.bannedAt ? (
            <button style={btnStyle("16,185,129", actionLoading === "unban")} disabled={!!actionLoading}
              onClick={() => handleAction("unban", () => unbanUser(user.id))}>
              Desbanear
            </button>
          ) : (
            <button style={btnStyle("248,113,113", actionLoading === "ban")} disabled={!!actionLoading}
              onClick={() => {
                const reason = prompt("Razón del ban:");
                if (reason) handleAction("ban", () => banUser(user.id, reason));
              }}>
              <Ban size={14} /> Banear
            </button>
          )}
        </div>
      </div>

      {/* Portfolios summary */}
      {user.portfolios && user.portfolios.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "1rem" }}>Portfolios ({user.portfolios.length})</h2>
          {user.portfolios.map((p: any) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0", borderBottom: "1px solid #1e2130", fontSize: "0.8125rem" }}>
              <span style={{ color: "#e2e8f0" }}>{p.name}</span>
              <span style={{ color: "#64748b" }}>{p.positions?.length || 0} posiciones</span>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
