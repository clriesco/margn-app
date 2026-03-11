import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { useToast } from "../components/Toast";
import { getCronStatus, triggerJob, getJobLogs } from "../lib/api";
import { Play, RefreshCw } from "lucide-react";

const JOBS = [
  { key: "price-ingestion", label: "Price Ingestion", description: "Ingestión de precios de Yahoo Finance" },
  { key: "metrics-refresh", label: "Metrics Refresh", description: "Recálculo de métricas de portfolios" },
  { key: "daily-check", label: "Daily Check", description: "Generación de notificaciones de estado" },
];

export default function OperationsPage() {
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  async function loadData() {
    setLoading(true);
    try {
      const [s, l] = await Promise.all([getCronStatus(), getJobLogs({ limit: 20 })]);
      setStatus(s);
      setLogs(l.data || l.logs || (Array.isArray(l) ? l : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const handleTrigger = async (job: string) => {
    setTriggering(job);
    try {
      await triggerJob(job);
      toast(`Job "${job}" ejecutado.`);
      loadData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setTriggering("");
    }
  };

  return (
    <AdminLayout title="Operaciones">
      <Head><title>Operaciones - Margn Admin</title></Head>

      {error && <div style={{ padding: "0.75rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#f87171", fontSize: "0.8125rem" }}>{error}</div>}

      <button onClick={loadData} style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 0.75rem", background: "#161822", color: "#94a3b8", border: "1px solid #1e2130", borderRadius: "8px", fontSize: "0.8125rem", cursor: "pointer", marginBottom: "1.5rem" }}>
        <RefreshCw size={14} /> Refrescar
      </button>

      {/* Jobs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        {JOBS.map((job) => (
          <div key={job.key} style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.25rem" }}>
            <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "0.375rem" }}>{job.label}</h3>
            <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "1rem" }}>{job.description}</p>
            <button onClick={() => handleTrigger(job.key)} disabled={!!triggering}
              style={{
                display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.5rem 1rem",
                background: triggering === job.key ? "#1e2130" : "rgba(16,185,129,0.1)",
                color: triggering === job.key ? "#334155" : "#34d399",
                border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px",
                fontSize: "0.8125rem", fontWeight: 600, cursor: triggering ? "not-allowed" : "pointer",
              }}>
              <Play size={14} /> {triggering === job.key ? "Ejecutando..." : "Ejecutar"}
            </button>
          </div>
        ))}
      </div>

      {/* Job Logs */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #1e2130" }}>
          <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "#e2e8f0" }}>Historial de Ejecuciones</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Job", "Estado", "Inicio", "Duración", "Resultado"].map((h) => (
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
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>{log.jobName || log.job}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
                      background: log.status === "success" ? "rgba(16,185,129,0.1)" : log.status === "running" ? "rgba(59,130,246,0.1)" : "rgba(248,113,113,0.1)",
                      color: log.status === "success" ? "#34d399" : log.status === "running" ? "#60a5fa" : "#f87171",
                    }}>{log.status}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>
                    {new Date(log.startedAt || log.createdAt).toLocaleString("es-ES")}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {log.result || log.error || "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
}
