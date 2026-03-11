import React, { useState, useEffect } from "react";
import Head from "next/head";
import AdminLayout from "../components/AdminLayout";
import { useToast } from "../components/Toast";
import { getVouchers, createVoucher, deactivateVoucher, updateVoucher } from "../lib/api";
import { Plus, Trash2, X, Pencil } from "lucide-react";

const VOUCHER_TYPES = [
  { value: "tier_upgrade", label: "Upgrade de tier" },
  { value: "discount_percent", label: "Descuento %" },
  { value: "discount_fixed", label: "Descuento fijo (EUR)" },
  { value: "trial_extension", label: "Extensión de trial" },
] as const;

const TIERS = ["starter", "pro", "institutional"] as const;

function formatBenefit(v: any): string {
  switch (v.type) {
    case "tier_upgrade": return v.tier ? `→ ${v.tier}` : "upgrade";
    case "discount_percent": return `${v.discountPercent ?? 0}%`;
    case "discount_fixed": return `€${((v.discountAmountCents ?? 0) / 100).toFixed(2)}`;
    case "trial_extension": return `${v.trialDays ?? 0} días`;
    default: return v.type;
  }
}

function formatDuration(months: number | null | undefined): string {
  if (!months) return "Permanente";
  if (months === 1) return "1 mes";
  if (months === 12) return "1 año";
  return `${months} meses`;
}

export default function VouchersPage() {
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<string>("discount_percent");
  const [tier, setTier] = useState<string>("pro");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmountCents, setDiscountAmountCents] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [stripeCouponId, setStripeCouponId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Deactivate confirm
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<string | null>(null);

  async function loadVouchers() {
    setLoading(true);
    try {
      const data = await getVouchers();
      setVouchers(data.data || data.vouchers || (Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadVouchers(); }, []);

  function resetForm() {
    setEditingId(null);
    setCode("");
    setType("discount_percent");
    setTier("pro");
    setDiscountPercent("");
    setDiscountAmountCents("");
    setTrialDays("");
    setDurationMonths("");
    setMaxRedemptions("");
    setExpiresAt("");
    setStripeCouponId("");
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(v: any) {
    setEditingId(v.id);
    setCode(v.code);
    setType(v.type);
    setTier(v.tier || "pro");
    setDiscountPercent(v.discountPercent != null ? String(v.discountPercent) : "");
    setDiscountAmountCents(v.discountAmountCents != null ? String(v.discountAmountCents / 100) : "");
    setTrialDays(v.trialDays != null ? String(v.trialDays) : "");
    setDurationMonths(v.durationMonths != null ? String(v.durationMonths) : "");
    setMaxRedemptions(v.maxRedemptions != null ? String(v.maxRedemptions) : "");
    setExpiresAt(v.expiresAt ? v.expiresAt.split("T")[0] : "");
    setStripeCouponId(v.stripeCouponId || "");
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    resetForm();
  }

  function isFormValid(): boolean {
    if (!code.trim()) return false;
    switch (type) {
      case "tier_upgrade": return !!tier;
      case "discount_percent": {
        const v = parseFloat(discountPercent);
        return !isNaN(v) && v > 0 && v <= 100;
      }
      case "discount_fixed": {
        const v = parseFloat(discountAmountCents);
        return !isNaN(v) && v > 0;
      }
      case "trial_extension": {
        const v = parseInt(trialDays);
        return !isNaN(v) && v > 0;
      }
      default: return false;
    }
  }

  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      code: code.toUpperCase().trim(),
      type,
      maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
      expiresAt: expiresAt || null,
      durationMonths: durationMonths ? parseInt(durationMonths) : null,
      stripeCouponId: stripeCouponId.trim() || null,
    };
    if (type === "tier_upgrade") payload.tier = tier;
    if (type === "discount_percent") payload.discountPercent = parseFloat(discountPercent);
    if (type === "discount_fixed") payload.discountAmountCents = Math.round(parseFloat(discountAmountCents) * 100);
    if (type === "trial_extension") payload.trialDays = parseInt(trialDays);
    return payload;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    try {
      if (editingId) {
        await updateVoucher(editingId, { ...buildPayload(), isActive: true });
        toast("Voucher actualizado.");
      } else {
        await createVoucher(buildPayload());
        toast("Voucher creado.");
      }
      closeForm();
      loadVouchers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await deactivateVoucher(id);
      toast("Voucher desactivado.");
      setConfirmDeactivateId(null);
      loadVouchers();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Error", "error");
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "0.5rem 0.75rem", background: "#0f1117",
    color: "#e2e8f0", border: "1px solid #1e2130", borderRadius: "6px",
    fontSize: "0.8125rem", outline: "none",
  };

  const labelStyle: React.CSSProperties = {
    display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem",
  };

  const isEditing = !!editingId;

  return (
    <AdminLayout title="Vouchers">
      <Head><title>Vouchers - Margn Admin</title></Head>

      {error && <div style={{ padding: "0.75rem", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "8px", marginBottom: "1rem", color: "#f87171", fontSize: "0.8125rem" }}>{error}</div>}

      <button onClick={() => showForm ? closeForm() : openCreate()}
        style={{ display: "flex", alignItems: "center", gap: "0.375rem", padding: "0.625rem 1rem", background: showForm ? "rgba(248,113,113,0.1)" : "rgba(59,130,246,0.1)", color: showForm ? "#f87171" : "#60a5fa", border: `1px solid ${showForm ? "rgba(248,113,113,0.3)" : "rgba(59,130,246,0.3)"}`, borderRadius: "8px", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", marginBottom: "1.5rem" }}>
        {showForm ? <><X size={16} /> Cancelar</> : <><Plus size={16} /> Crear Voucher</>}
      </button>

      {showForm && (
        <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h3 style={{ color: "#e2e8f0", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
            {isEditing ? `Editar Voucher — ${code}` : "Nuevo Voucher"}
          </h3>

          {/* Row 1: Code + Type */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={labelStyle}>Codigo</label>
              {isEditing ? (
                <div style={{ ...inputStyle, fontFamily: "monospace", background: "#0a0b0f", color: "#64748b", cursor: "not-allowed" }}>{code}</div>
              ) : (
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="PROMO50" style={{ ...inputStyle, fontFamily: "monospace", textTransform: "uppercase" }} />
              )}
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                {VOUCHER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Row 2: Type-specific field */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            {type === "tier_upgrade" && (
              <div>
                <label style={labelStyle}>Tier a otorgar</label>
                <select value={tier} onChange={(e) => setTier(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                  {TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
            )}
            {type === "discount_percent" && (
              <div>
                <label style={labelStyle}>Descuento (%)</label>
                <input type="number" min="1" max="100" value={discountPercent}
                  onChange={(e) => setDiscountPercent(e.target.value)}
                  placeholder="50" style={inputStyle} />
              </div>
            )}
            {type === "discount_fixed" && (
              <div>
                <label style={labelStyle}>Descuento (EUR)</label>
                <input type="number" min="0.01" step="0.01" value={discountAmountCents}
                  onChange={(e) => setDiscountAmountCents(e.target.value)}
                  placeholder="10.00" style={inputStyle} />
              </div>
            )}
            {type === "trial_extension" && (
              <div>
                <label style={labelStyle}>Dias de trial</label>
                <input type="number" min="1" value={trialDays}
                  onChange={(e) => setTrialDays(e.target.value)}
                  placeholder="30" style={inputStyle} />
              </div>
            )}
            <div>
              <label style={labelStyle}>Duracion del beneficio</label>
              <select value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="">Permanente</option>
                <option value="1">1 mes</option>
                <option value="3">3 meses</option>
                <option value="6">6 meses</option>
                <option value="12">1 año</option>
              </select>
            </div>
          </div>

          {/* Row 3: Limits */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            <div>
              <label style={labelStyle}>Maximo usos</label>
              <input type="number" min="1" value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                placeholder="Ilimitado" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expiracion</label>
              <input type="date" value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer" }} />
            </div>
            <div>
              <label style={labelStyle}>Stripe Coupon ID</label>
              <input value={stripeCouponId}
                onChange={(e) => setStripeCouponId(e.target.value)}
                placeholder="Opcional" style={{ ...inputStyle, fontFamily: "monospace" }} />
            </div>
          </div>

          <button onClick={handleSubmit} disabled={submitting || !isFormValid()}
            style={{ padding: "0.625rem 1.5rem", background: (submitting || !isFormValid()) ? "#1e2130" : "linear-gradient(135deg, #3b82f6, #6366f1)", color: (submitting || !isFormValid()) ? "#64748b" : "white", border: "none", borderRadius: "8px", fontSize: "0.8125rem", fontWeight: 600, cursor: (submitting || !isFormValid()) ? "not-allowed" : "pointer" }}>
            {submitting ? (isEditing ? "Guardando..." : "Creando...") : (isEditing ? "Guardar Cambios" : "Crear Voucher")}
          </button>
        </div>
      )}

      {/* Vouchers table */}
      <div style={{ background: "#161822", border: "1px solid #1e2130", borderRadius: "12px", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1e2130" }}>
              {["Codigo", "Tipo", "Beneficio", "Usos", "Duracion", "Expira", "Estado", ""].map((h) => (
                <th key={h} style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Cargando...</td></tr>
            ) : vouchers.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "#64748b" }}>Sin vouchers</td></tr>
            ) : (
              vouchers.map((v: any) => (
                <tr key={v.id} style={{ borderBottom: "1px solid #1e2130", opacity: editingId === v.id ? 0.5 : 1 }}>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0", fontFamily: "monospace", fontWeight: 600 }}>{v.code}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {VOUCHER_TYPES.find((t) => t.value === v.type)?.label ?? v.type}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#e2e8f0", fontWeight: 500 }}>
                    {formatBenefit(v)}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {v.currentRedemptions ?? v._count?.redemptions ?? 0}{v.maxRedemptions ? ` / ${v.maxRedemptions}` : ""}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {formatDuration(v.durationMonths)}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                    {v.expiresAt ? new Date(v.expiresAt).toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span style={{
                      padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600,
                      background: v.isActive ? "rgba(16,185,129,0.1)" : "rgba(248,113,113,0.1)",
                      color: v.isActive ? "#34d399" : "#f87171",
                    }}>{v.isActive ? "Activo" : "Inactivo"}</span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    {confirmDeactivateId === v.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ fontSize: "0.6875rem", color: "#94a3b8", whiteSpace: "nowrap" }}>Desactivar?</span>
                        <button onClick={() => handleDeactivate(v.id)} aria-label="Confirmar"
                          style={{ padding: "0.25rem 0.5rem", background: "rgba(248,113,113,0.2)", color: "#f87171", border: "none", borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer" }}>
                          Si
                        </button>
                        <button onClick={() => setConfirmDeactivateId(null)} aria-label="Cancelar"
                          style={{ padding: "0.25rem 0.5rem", background: "rgba(100,116,139,0.1)", color: "#64748b", border: "none", borderRadius: "4px", fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer" }}>
                          No
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        {!v.isActive && (
                          <button onClick={() => openEdit(v)} aria-label="Editar voucher"
                            style={{ padding: "0.25rem 0.5rem", background: "rgba(96,165,250,0.1)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {v.isActive && (
                          <button onClick={() => setConfirmDeactivateId(v.id)} aria-label="Desactivar voucher"
                            style={{ padding: "0.25rem 0.5rem", background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)", borderRadius: "6px", cursor: "pointer", display: "flex", alignItems: "center" }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
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
