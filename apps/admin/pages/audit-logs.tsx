import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { getAuditLogs } from "../lib/api";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  "user.ban": "Banear usuario",
  "user.unban": "Desbanear usuario",
  "user.update_role": "Cambiar rol",
  "subscription.override_tier": "Override tier",
  "subscription.extend_trial": "Extender trial",
  "subscription.comp": "Cortesía",
  "voucher.create": "Crear voucher",
  "voucher.update": "Actualizar voucher",
  "cron.trigger": "Ejecutar job",
};

const CATEGORY_COLORS: Record<string, { color: string; bg: string }> = {
  user: { color: "#c084fc", bg: "rgba(192,132,252,0.1)" },
  subscription: { color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  voucher: { color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  cron: { color: "#fb923c", bg: "rgba(251,146,60,0.1)" },
};

function getCategory(action: string): string {
  return action.split(".")[0] || "user";
}

function parseDetails(details: unknown): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === "object") return details as Record<string, unknown>;
  if (typeof details === "string") {
    try { return JSON.parse(details); } catch { return null; }
  }
  return null;
}

function formatDetail(action: string, details: unknown): string {
  const d = parseDetails(details);
  if (!d) return "—";

  switch (action) {
    case "user.ban":
      return d.reason ? `Razón: ${d.reason}` : "Baneado";
    case "user.unban":
      return "Desbaneado";
    case "user.update_role":
      if (d.before && d.after) {
        const before = typeof d.before === "object" ? (d.before as any).role : d.before;
        const after = typeof d.after === "object" ? (d.after as any).role : d.after;
        return `${before} → ${after}`;
      }
      return d.role ? `Rol: ${d.role}` : "Rol actualizado";
    case "subscription.override_tier":
      if (d.before && d.after) {
        const before = typeof d.before === "object" ? (d.before as any).tier : d.before;
        const after = typeof d.after === "object" ? (d.after as any).tier : d.after;
        return `${before} → ${after}`;
      }
      return d.tier ? `Tier: ${d.tier}` : "Tier actualizado";
    case "subscription.extend_trial":
      return d.days ? `+${d.days} días` : "Trial extendido";
    case "subscription.comp":
      return d.tier ? `Tier: ${d.tier}` : "Cortesía otorgada";
    case "voucher.create":
      return [d.code, d.type].filter(Boolean).join(" · ") || "Voucher creado";
    case "voucher.update": {
      const after = d.after as Record<string, unknown> | undefined;
      if (after?.isActive === false) return "Desactivado";
      return "Actualizado";
    }
    case "cron.trigger":
      return d.jobName ? String(d.jobName) : "Job ejecutado";
    default:
      return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(", ").slice(0, 80) || "—";
  }
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 30;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getAuditLogs({ action: action || undefined, page, limit });
        setLogs(data.data || data.logs || (Array.isArray(data) ? data : []));
        setTotal(data.meta?.total || data.total || 0);
      } catch { /* ignore */ } finally {
        setLoading(false);
      }
    }
    load();
  }, [action, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title="Audit Log">
      <Head><title>Audit Log - Margn Admin</title></Head>

      <div style={{ marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="Filtrar por acción..."
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          style={{
            padding: "0.5rem 0.75rem", background: "#161822", color: "#e2e8f0",
            border: "1px solid #1e2130", borderRadius: "8px", fontSize: "0.8125rem", outline: "none",
          }}
        />
      </div>

      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Fecha", "Admin", "Acción", "Resumen", ""].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Cargando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Sin registros</td></tr>
            ) : (
              logs.map((log: any, i: number) => {
                const cat = getCategory(log.action);
                const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.user;
                const isExpanded = expandedId === (log.id || String(i));
                const details = parseDetails(log.details);

                return (
                  <React.Fragment key={log.id || i}>
                    <tr style={{ borderBottom: isExpanded ? "none" : "1px solid #1e2130" }}>
                      <td style={{ padding: "0.75rem 1rem", color: "#64748b", whiteSpace: "nowrap" }}>
                        {new Date(log.createdAt).toLocaleString("es-ES")}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>{log.admin?.email || log.adminId}</td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <span style={{ padding: "0.125rem 0.5rem", background: colors.bg, color: colors.color, borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 600 }}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                        {formatDetail(log.action, log.details)}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        {details && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : (log.id || String(i)))}
                            aria-label={isExpanded ? "Colapsar" : "Expandir"}
                            style={{ background: "none", border: "none", padding: "0.25rem", cursor: "pointer", display: "flex", alignItems: "center", color: "#64748b" }}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && details && (
                      <tr style={{ borderBottom: "1px solid #1e2130" }}>
                        <td colSpan={5} style={{ padding: "0 1rem 0.75rem 1rem" }}>
                          <pre style={{
                            margin: 0, padding: "0.75rem", background: "#0f1117", borderRadius: "6px",
                            fontSize: "0.75rem", color: "#94a3b8", fontFamily: "monospace",
                            whiteSpace: "pre-wrap", wordBreak: "break-word",
                          }}>
                            {JSON.stringify(details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
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
