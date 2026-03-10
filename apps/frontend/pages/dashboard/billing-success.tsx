import React, { useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { invalidateSubscriptionCache } from "../../lib/hooks/use-subscription";
import DashboardSidebar from "../../components/DashboardSidebar";
import { CheckCircle } from "lucide-react";

export default function BillingSuccess() {
  const router = useRouter();

  useEffect(() => {
    // Invalidate subscription cache so the app picks up the new plan
    invalidateSubscriptionCache();
  }, []);

  return (
    <>
      <Head>
        <title>Suscripción activada - Margn</title>
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
                background: "rgba(16, 185, 129, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1.5rem",
              }}
            >
              <CheckCircle size={32} color="#10b981" />
            </div>

            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 700,
                color: "var(--text-primary)",
                marginBottom: "0.75rem",
              }}
            >
              Suscripción activada
            </h1>

            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9375rem",
                marginBottom: "2rem",
                lineHeight: 1.5,
              }}
            >
              Tu plan ha sido actualizado correctamente. Ya puedes acceder a
              todas las funcionalidades de tu nuevo plan.
            </p>

            <button
              onClick={() => router.push("/dashboard")}
              style={{
                padding: "0.75rem 2rem",
                background:
                  "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.9375rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Ir al Dashboard
            </button>
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
