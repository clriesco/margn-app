import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import AdminLayout from "../components/AdminLayout";
import { getUsers } from "../lib/api";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const limit = 20;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const data = await getUsers({ search: search || undefined, page, limit });
        setUsers(data.users || data);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [search, page]);

  const totalPages = Math.ceil(total / limit);

  return (
    <AdminLayout title="Usuarios">
      <Head><title>Usuarios - Margn Admin</title></Head>

      {/* Search */}
      <div style={{ marginBottom: "1.5rem", position: "relative" }}>
        <Search size={16} style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "#64748b" }} />
        <input
          type="text"
          placeholder="Buscar por email o nombre..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: "100%", maxWidth: "400px", padding: "0.625rem 0.75rem 0.625rem 2.25rem",
            background: "#161822", color: "#e2e8f0", border: "1px solid #1e2130",
            borderRadius: "8px", fontSize: "0.875rem", outline: "none",
          }}
        />
      </div>

      {error && (
        <div style={{ padding: "1rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem" }}>
          <p style={{ color: "#f87171" }}>{error}</p>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Email", "Nombre", "Tier", "Estado", "Creado"].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Cargando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Sin resultados</td></tr>
            ) : (
              users.map((user: any) => (
                <tr key={user.id} style={{ borderBottom: "1px solid #1e2130" }}>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <Link href={`/users/${user.id}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{user.email}</Link>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>{user.fullName || "—"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
                      background: user.subscription?.tier === "pro" ? "rgba(59,130,246,0.1)" : user.subscription?.tier === "institutional" ? "rgba(168,85,247,0.1)" : "rgba(148,163,184,0.1)",
                      color: user.subscription?.tier === "pro" ? "#60a5fa" : user.subscription?.tier === "institutional" ? "#c084fc" : "#94a3b8",
                    }}>{user.subscription?.tier || "starter"}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: user.bannedAt ? "#f87171" : "#94a3b8" }}>
                    {user.bannedAt ? "Baneado" : "Activo"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#64748b" }}>
                    {new Date(user.createdAt).toLocaleDateString("es-ES")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
