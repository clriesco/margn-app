import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { getVouchers, createVoucher, deactivateVoucher } from "../lib/api";
import { Plus, Trash2 } from "lucide-react";

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Create form
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [applicableTiers, setApplicableTiers] = useState("pro,institutional");
  const [creating, setCreating] = useState(false);

  async function loadVouchers() {
    setLoading(true);
    try {
      const data = await getVouchers();
      setVouchers(data.vouchers || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadVouchers(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      await createVoucher({
        code: code.toUpperCase(),
        discountType,
        discountValue: parseFloat(discountValue),
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        applicableTiers: applicableTiers.split(",").map((t) => t.trim()),
      });
      setMessage("Voucher creado.");
      setShowCreate(false);
      setCode(""); setDiscountValue(""); setMaxRedemptions("");
      setTimeout(() => setMessage(""), 3000);
      loadVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm("Desactivar este voucher?")) return;
    try {
      await deactivateVoucher(id);
      loadVouchers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem", background: "#0f1117",
    color: "#e2e8f0", border: "1px solid #1e2130", borderRadius: "6px",
    fontSize: "0.8125rem", outline: "none",
  };

  return (
    <AdminLayout title="Vouchers">
      <Head><title>Vouchers - Margn Admin</title></Head>

      {message && <div style={{ padding: "0.75rem", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#34d399", fontSize: "0.8125rem" }}>{message}</div>}
      {error && <div style={{ padding: "0.75rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#f87171", fontSize: "0.8125rem" }}>{error}</div>}

      <button onClick={() => setShowCreate(!showCreate)}
        style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.625rem 1rem", background: "rgba(59,130,246,0.1)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", marginBottom: "1.5rem" }}>
        <Plus size={16} /> Crear Voucher
      </button>

      {showCreate && (
        <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Nuevo Voucher</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Código</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PROMO50" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Tipo</label>
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="percentage">Porcentaje</option>
                <option value="fixed">Fijo (EUR)</option>
                <option value="trial_days">Días de trial</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Valor</label>
              <input type="number" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="50" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Máximo usos</label>
              <input type="number" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="Ilimitado" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>Tiers aplicables (separados por coma)</label>
              <input value={applicableTiers} onChange={(e) => setApplicableTiers(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !code || !discountValue}
            style={{ marginTop: "1rem", padding: "0.625rem 1.5rem", background: creating ? "#1e2130" : "linear-gradient(135deg, #3b82f6, #6366f1)", color: "white", border: "none", borderRadius: "8px", fontSize: "0.8125rem", fontWeight: 600, cursor: creating ? "not-allowed" : "pointer" }}>
            {creating ? "Creando..." : "Crear"}
          </button>
        </div>
      )}

      {/* Vouchers table */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Código", "Tipo", "Valor", "Usos", "Tiers", "Estado", ""].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Cargando...</td></tr>
            ) : vouchers.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Sin vouchers</td></tr>
            ) : (
              vouchers.map((v: any) => (
                <tr key={v.id} style={{ borderBottom: "1px solid #1e2130" }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0", fontFamily: "monospace", fontWeight: 600 }}>{v.code}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{v.discountType}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0" }}>
                    {v.discountType === "percentage" ? `${v.discountValue}%` : v.discountType === "fixed" ? `€${v.discountValue}` : `${v.discountValue} días`}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {v._count?.redemptions ?? v.redemptions?.length ?? 0}{v.maxRedemptions ? ` / ${v.maxRedemptions}` : ""}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>{v.applicableTiers?.join(", ") || "—"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
                      background: v.isActive ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)",
                      color: v.isActive ? "#34d399" : "#f87171",
                    }}>{v.isActive ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {v.isActive && (
                      <button onClick={() => handleDeactivate(v.id)}
                        style={{ padding: "0.25rem 0.5rem", background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                        <Trash2 size={14} />
                      </button>
                    )}
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
