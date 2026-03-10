import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { getAuditLogs } from "../lib/api";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 30;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getAuditLogs({ action: action || undefined, page, limit });
        setLogs(data.logs || data);
        setTotal(data.total || 0);
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
              {["Fecha", "Admin", "Acción", "Target", "Detalles"].map((h) => (
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
              logs.map((log: any, i: number) => (
                <tr key={log.id || i} style={{ borderBottom: "1px solid #1e2130" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b", whiteSpace: "nowrap" }}>
                    {new Date(log.createdAt).toLocaleString("es-ES")}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>{log.admin?.email || log.adminId}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{ padding: "0.125rem 0.5rem", background: "rgba(59,130,246,0.1)", color: "#60a5fa", borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 600 }}>
                      {log.action}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{log.targetId || "—"}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
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
