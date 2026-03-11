import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import DashboardSidebar from "../../components/DashboardSidebar";
import { XCircle } from "lucide-react";

export default function BillingCancel() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Pago cancelado - Margn</title>
      </Head>
      <DashboardSidebar>
        <div
          style={{
            padding: "2rem",
            paddingTop: "4rem",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "60vh",
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "3rem",
              textAlign: "center",
              maxWidth: "480px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "rgba(148, 163, 184, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.5rem",
              }}
            >
              <XCircle size={32} color="#94a3b8" />
            </div>

            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "0.75rem",
              }}
            >
              Pago cancelado
            </h1>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9375rem",
                marginBottom: "2rem",
                lineHeight: 1.5,
              }}
            >
              El proceso de pago fue cancelado. No se ha realizado ningún
              cargo. Puedes intentarlo de nuevo cuando quieras.
            </p>

            <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
              <button
                onClick={() => router.push("/dashboard/billing")}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                  color: "white",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Ver Planes
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                style={{
                  padding: "0.75rem 1.5rem",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "0.9375rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Dashboard
              </button>
            </div>
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
