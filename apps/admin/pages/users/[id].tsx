import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import AdminLayout from "../../components/AdminLayout";
import { useToast } from "../../components/Toast";
import { getUser, updateUserRole, banUser, unbanUser, overrideTier, extendTrial, grantComplimentary } from "../../lib/api";
import { ArrowLeft, Shield, Ban, Gift, Clock, Wallet, TrendingUp, BarChart3, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

const TIERS = ["starter", "pro", "institutional"] as const;

const tierColors: Record<string, { bg: string; color: string }> = {
  starter: { bg: "rgba(148,163,184,0.1)", color: "#94a3b8" },
  pro: { bg: "rgba(167,139,250,0.1)", color: "#a78bfa" },
  institutional: { bg: "rgba(251,191,36,0.1)", color: "#fbbf24" },
};

function TierBadge({ tier }: { tier: string }) {
  const t = tierColors[tier] || tierColors.starter;
  return (
    <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600, background: t.bg, color: t.color, textTransform: "capitalize" }}>
      {tier}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  const isTrial = status === "trialing";
  return (
    <span style={{
      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
      background: isActive ? "rgba(16,185,129,0.1)" : isTrial ? "rgba(96,165,250,0.1)" : "rgba(248,113,113,0.1)",
      color: isActive ? "#34d399" : isTrial ? "#60a5fa" : "#f87171",
    }}>
      {status}
    </span>
  );
}

function leverageColor(lev: number | null): string {
  if (lev == null) return "#64748b";
  if (lev >= 2.5 && lev <= 4.0) return "#34d399";
  if (lev > 4.0) return "#f87171";
  return "#fbbf24";
}

export default function UserDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState("");
  const { toast } = useToast();

  // Inline action forms
  const [showTierOverride, setShowTierOverride] = useState(false);
  const [selectedTier, setSelectedTier] = useState("pro");
  const [showExtendTrial, setShowExtendTrial] = useState(false);
  const [trialDays, setTrialDays] = useState("14");
  const [showComp, setShowComp] = useState(false);
  const [compTier, setCompTier] = useState("pro");
  const [showBan, setShowBan] = useState(false);
  const [banReason, setBanReason] = useState("");
  const [showDanger, setShowDanger] = useState(false);

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
    setError("");
    try {
      await fn();
      const data = await getUser(id as string);
      setUser(data);
      toast(`Accion "${action}" completada.`);
      setShowTierOverride(false);
      setShowExtendTrial(false);
      setShowComp(false);
      setShowBan(false);
      setBanReason("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
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
  const labelStyle: React.CSSProperties = { color: "#64748b", fontSize: "0.75rem", marginBottom: "0.125rem" };
  const valueStyle: React.CSSProperties = { color: "#e2e8f0", fontSize: "0.875rem", fontWeight: 500 };
  const inputStyle: React.CSSProperties = {
    padding: "0.375rem 0.625rem", background: "#0f1117", color: "#e2e8f0",
    border: "1px solid #1e2130", borderRadius: "6px", fontSize: "0.8125rem", outline: "none",
  };
  const actionBtnStyle = (color: string, disabled?: boolean): React.CSSProperties => ({
    padding: "0.375rem 0.75rem", background: disabled ? "#1e2130" : `rgba(${color}, 0.1)`,
    color: disabled ? "#334155" : `rgb(${color})`, border: `1px solid rgba(${color}, 0.3)`,
    borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer",
    display: "inline-flex", alignItems: "center", gap: "0.25rem",
  });

  const sub = user.subscription;
  const currentTier = sub?.tier || "starter";

  return (
    <AdminLayout>
      <Head><title>{user.email} - Margn Admin</title></Head>

      {/* Back button */}
      <button onClick={() => router.push("/users")} style={{ display: "flex", alignItems: "center", gap: "0.375rem", color: "#60a5fa", background: "none", border: "none", fontSize: "0.8125rem", marginBottom: "1.5rem", cursor: "pointer" }}>
        <ArrowLeft size={14} /> Volver a usuarios
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 700, color: "#e2e8f0", margin: 0 }}>{user.email}</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <TierBadge tier={currentTier} />
          {user.role === "admin" && (
            <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600, background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>admin</span>
          )}
          {user.bannedAt && (
            <span style={{ padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600, background: "rgba(248,113,113,0.1)", color: "#f87171" }}>baneado</span>
          )}
        </div>
      </div>

      {error && <div style={{ padding: "0.75rem 1rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#f87171", fontSize: "0.8125rem" }}>{error}</div>}

      {/* User Info */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>Informacion</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
          <div>
            <div style={labelStyle}>Nombre</div>
            <div style={valueStyle}>{user.fullName || "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Email</div>
            <div style={valueStyle}>{user.email}</div>
          </div>
          <div>
            <div style={labelStyle}>Registrado</div>
            <div style={valueStyle}>{new Date(user.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</div>
          </div>
          <div>
            <div style={labelStyle}>Ultimo acceso</div>
            <div style={valueStyle}>{user.updatedAt ? new Date(user.updatedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
          </div>
          {user.bannedAt && (
            <div style={{ gridColumn: "span 2" }}>
              <div style={{ ...labelStyle, color: "#f87171" }}>Razon del ban</div>
              <div style={{ ...valueStyle, color: "#f87171" }}>{user.banReason || "Sin razon especificada"}</div>
            </div>
          )}
        </div>
      </div>

      {/* Subscription */}
      <div style={cardStyle}>
        <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>Suscripcion</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <div style={labelStyle}>Tier</div>
            <div style={{ marginTop: "0.25rem" }}><TierBadge tier={currentTier} /></div>
          </div>
          <div>
            <div style={labelStyle}>Estado</div>
            <div style={{ marginTop: "0.25rem" }}>{sub ? <StatusBadge status={sub.status} /> : <span style={{ color: "#64748b", fontSize: "0.8125rem" }}>—</span>}</div>
          </div>
          <div>
            <div style={labelStyle}>Facturacion</div>
            <div style={valueStyle}>{sub?.billingInterval === "yearly" ? "Anual" : sub?.billingInterval === "monthly" ? "Mensual" : "—"}</div>
          </div>
          <div>
            <div style={labelStyle}>Fin de periodo</div>
            <div style={valueStyle}>{sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES") : "—"}</div>
          </div>
          {sub?.trialEnd && (
            <div>
              <div style={labelStyle}>Fin de trial</div>
              <div style={valueStyle}>{new Date(sub.trialEnd).toLocaleDateString("es-ES")}</div>
            </div>
          )}
          {sub?.cancelAtPeriodEnd && (
            <div>
              <div style={{ ...labelStyle, color: "#fbbf24" }}>Cancelacion</div>
              <div style={{ ...valueStyle, color: "#fbbf24" }}>Cancela al fin del periodo</div>
            </div>
          )}
        </div>

        {/* Subscription actions */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", paddingTop: "1rem", borderTop: "1px solid #1e2130" }}>
          <button style={actionBtnStyle("168,85,247", !!actionLoading)} disabled={!!actionLoading}
            onClick={() => { setShowTierOverride(!showTierOverride); setShowExtendTrial(false); setShowComp(false); }}>
            <Gift size={12} /> Override Tier
          </button>
          <button style={actionBtnStyle("251,191,36", !!actionLoading)} disabled={!!actionLoading}
            onClick={() => { setShowExtendTrial(!showExtendTrial); setShowTierOverride(false); setShowComp(false); }}>
            <Clock size={12} /> Extender Trial
          </button>
          <button style={actionBtnStyle("96,165,250", !!actionLoading)} disabled={!!actionLoading}
            onClick={() => { setShowComp(!showComp); setShowTierOverride(false); setShowExtendTrial(false); }}>
            <Gift size={12} /> Complimentary
          </button>
        </div>

        {/* Inline: Override Tier */}
        {showTierOverride && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", padding: "0.75rem", background: "#0f1117", borderRadius: "8px" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Nuevo tier:</span>
            <select value={selectedTier} onChange={(e) => setSelectedTier(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <button style={actionBtnStyle("168,85,247", actionLoading === "tier")} disabled={!!actionLoading}
              onClick={() => handleAction("tier", () => overrideTier(user.id, selectedTier))}>
              {actionLoading === "tier" ? "Aplicando..." : "Aplicar"}
            </button>
            <button onClick={() => setShowTierOverride(false)} style={{ ...actionBtnStyle("148,163,184"), padding: "0.375rem 0.5rem" }}>Cancelar</button>
          </div>
        )}

        {/* Inline: Extend Trial */}
        {showExtendTrial && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", padding: "0.75rem", background: "#0f1117", borderRadius: "8px" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Dias:</span>
            <input type="number" min="1" value={trialDays} onChange={(e) => setTrialDays(e.target.value)}
              style={{ ...inputStyle, width: "5rem" }} />
            <button style={actionBtnStyle("251,191,36", actionLoading === "trial")} disabled={!!actionLoading || !trialDays}
              onClick={() => handleAction("trial", () => extendTrial(user.id, parseInt(trialDays)))}>
              {actionLoading === "trial" ? "Aplicando..." : "Aplicar"}
            </button>
            <button onClick={() => setShowExtendTrial(false)} style={{ ...actionBtnStyle("148,163,184"), padding: "0.375rem 0.5rem" }}>Cancelar</button>
          </div>
        )}

        {/* Inline: Complimentary */}
        {showComp && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem", padding: "0.75rem", background: "#0f1117", borderRadius: "8px" }}>
            <span style={{ color: "#94a3b8", fontSize: "0.75rem" }}>Tier:</span>
            <select value={compTier} onChange={(e) => setCompTier(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
              {TIERS.filter((t) => t !== "starter").map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <button style={actionBtnStyle("96,165,250", actionLoading === "comp")} disabled={!!actionLoading}
              onClick={() => handleAction("comp", () => grantComplimentary(user.id, compTier))}>
              {actionLoading === "comp" ? "Aplicando..." : "Otorgar"}
            </button>
            <button onClick={() => setShowComp(false)} style={{ ...actionBtnStyle("148,163,184"), padding: "0.375rem 0.5rem" }}>Cancelar</button>
          </div>
        )}
      </div>

      {/* Portfolios */}
      {user.portfolios && user.portfolios.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            Portfolios ({user.portfolios.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #1e2130" }}>
                {["Nombre", "Equity", "Leverage", "Posiciones", "Creado"].map((h) => (
                  <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {user.portfolios.map((p: any) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #1e2130" }}>
                  <td style={{ padding: "0.625rem 0.75rem", color: "#e2e8f0", fontWeight: 500 }}>{p.name}</td>
                  <td style={{ padding: "0.625rem 0.75rem", color: "#e2e8f0" }}>
                    {p.equity != null ? `$${Number(p.equity).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", color: leverageColor(p.leverage), fontWeight: 500 }}>
                    {p.leverage != null ? `${Number(p.leverage).toFixed(2)}x` : "—"}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", color: "#94a3b8" }}>
                    {p.positionCount ?? p.positions?.length ?? p._count?.positions ?? 0}
                  </td>
                  <td style={{ padding: "0.625rem 0.75rem", color: "#64748b" }}>
                    {new Date(p.createdAt).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Contributions */}
      {user.recentContributions && user.recentContributions.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            Contribuciones recientes
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            {user.recentContributions.map((c: any, i: number) => (
              <div key={c.id || i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.25rem", borderBottom: i < user.recentContributions.length - 1 ? "1px solid #1e2130" : "none" }}>
                <div style={{ width: 24, height: 24, borderRadius: "6px", background: "rgba(52,211,153,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Wallet size={12} color="#34d399" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "0.8125rem", color: "#e2e8f0" }}>
                    ${Number(c.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  {c.portfolio?.name && (
                    <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "0.5rem" }}>{c.portfolio.name}</span>
                  )}
                </div>
                <span style={{ fontSize: "0.6875rem", color: "#64748b", flexShrink: 0 }}>
                  {new Date(c.contributedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <BarChart3 size={14} color="#60a5fa" />
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Portfolios</span>
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e2e8f0" }}>{user.counts?.portfolios ?? user.portfolios?.length ?? 0}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <TrendingUp size={14} color="#a78bfa" />
            <span style={{ color: "#64748b", fontSize: "0.75rem" }}>Estrategias guardadas</span>
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e2e8f0" }}>{user.counts?.strategies ?? 0}</div>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ ...cardStyle, border: "1px solid rgba(248,113,113,0.2)" }}>
        <button onClick={() => setShowDanger(!showDanger)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertTriangle size={14} color="#f87171" />
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.05em" }}>Zona peligrosa</span>
          </div>
          {showDanger ? <ChevronUp size={14} color="#f87171" /> : <ChevronDown size={14} color="#f87171" />}
        </button>

        {showDanger && (
          <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid rgba(248,113,113,0.15)", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Role toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "0.8125rem", color: "#e2e8f0", fontWeight: 500 }}>{user.role === "admin" ? "Revocar permisos de admin" : "Otorgar permisos de admin"}</div>
                <div style={{ fontSize: "0.6875rem", color: "#64748b" }}>Rol actual: {user.role}</div>
              </div>
              <button style={actionBtnStyle("96,165,250", actionLoading === "role")} disabled={!!actionLoading}
                onClick={() => handleAction("role", () => updateUserRole(user.id, user.role === "admin" ? "user" : "admin"))}>
                <Shield size={12} /> {user.role === "admin" ? "Quitar Admin" : "Hacer Admin"}
              </button>
            </div>

            {/* Ban/Unban */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.8125rem", color: "#e2e8f0", fontWeight: 500 }}>{user.bannedAt ? "Desbanear usuario" : "Banear usuario"}</div>
                <div style={{ fontSize: "0.6875rem", color: "#64748b" }}>{user.bannedAt ? `Baneado el ${new Date(user.bannedAt).toLocaleDateString("es-ES")}` : "El usuario no podra acceder a la plataforma"}</div>
              </div>
              {user.bannedAt ? (
                <button style={actionBtnStyle("16,185,129", actionLoading === "unban")} disabled={!!actionLoading}
                  onClick={() => handleAction("unban", () => unbanUser(user.id))}>
                  {actionLoading === "unban" ? "..." : "Desbanear"}
                </button>
              ) : (
                <button style={actionBtnStyle("248,113,113", !!actionLoading)} disabled={!!actionLoading}
                  onClick={() => setShowBan(!showBan)}>
                  <Ban size={12} /> Banear
                </button>
              )}
            </div>

            {/* Ban reason input */}
            {showBan && !user.bannedAt && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem", background: "#0f1117", borderRadius: "8px" }}>
                <input value={banReason} onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Razon del ban..." style={{ ...inputStyle, flex: 1 }} />
                <button style={actionBtnStyle("248,113,113", actionLoading === "ban" || !banReason.trim())}
                  disabled={!!actionLoading || !banReason.trim()}
                  onClick={() => handleAction("ban", () => banUser(user.id, banReason.trim()))}>
                  {actionLoading === "ban" ? "..." : "Confirmar ban"}
                </button>
                <button onClick={() => { setShowBan(false); setBanReason(""); }}
                  style={{ ...actionBtnStyle("148,163,184"), padding: "0.375rem 0.5rem" }}>Cancelar</button>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
