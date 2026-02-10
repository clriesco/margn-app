import React, { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../lib/auth";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { createContribution } from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import { invalidatePortfolioCache } from "../../lib/hooks/use-portfolio-data";
import { NumberInput } from "../../components/NumberInput";
import { parseNumberES } from "../../lib/number-format";

/**
 * Monthly contribution page - Registers the contribution amount
 */
export default function Contribution() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();

  const [amount, setAmount] = useState<number>(1000);
  const [note, setNote] = useState("");
  const [movementType, setMovementType] = useState<"contribution" | "withdrawal">("contribution");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Check if this is an extra contribution (from recommendations)
  const isExtraContribution = router.query.extra === "true";

  // Pre-fill amount and note from URL query params (e.g., from recommendations)
  useEffect(() => {
    const urlAmount = router.query.amount as string;

    if (urlAmount) {
      const parsedAmount = parseNumberES(urlAmount);
      setAmount(isNaN(parsedAmount) ? 1000 : parsedAmount);
      if (isExtraContribution) {
        setNote(
          `Aportación extra para reducir el leverage - ${new Date().toLocaleDateString(
            "es-ES"
          )}`
        );
      }
    }
  }, [router.query.amount, isExtraContribution]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!portfolioId) {
      setError("No se ha seleccionado un portfolio");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await createContribution({
        portfolioId,
        amount: isNaN(amount) ? 0 : amount,
        type: movementType,
        note:
          note ||
          (movementType === "withdrawal"
            ? `Retiro - ${new Date().toLocaleDateString("es-ES")}`
            : `Monthly contribution - ${new Date().toLocaleDateString("es-ES")}`),
      });

      // Invalidate cache so dashboard shows updated data
      invalidatePortfolioCache(portfolioId, user?.email);

      setMessage(
        movementType === "withdrawal"
          ? "Retiro registrado correctamente."
          : "Aportación registrada correctamente."
      );

      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al registrar la aportación"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || !portfolioId) {
    return (
      <>
        <Head>
          <title>Cargando...</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <p style={{ color: "var(--text-primary)", fontSize: "1.2rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Movimientos - Margn</title>
        <style
          dangerouslySetInnerHTML={{
            __html: `
          @media (max-width: 768px) {
            .contribution-wrapper {
              padding: 1rem !important;
              padding-top: 4rem !important;
            }
            .contribution-input {
              font-size: 1.125rem !important;
              padding: 0.875rem 1rem !important;
            }
            .submit-button {
              padding: 0.875rem !important;
              font-size: 0.95rem !important;
            }
          }
          @media (max-width: 480px) {
            .contribution-wrapper {
              padding: 0.75rem !important;
              padding-top: 4rem !important;
            }
          }
        `,
          }}
        />
      </Head>
      <DashboardSidebar>
        <div
          style={{
            padding: "2rem",
            paddingTop: "4rem",
          }}
          className="contribution-wrapper"
        >
          <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
            {/* Header */}
            <div
              style={{
                marginBottom: "2rem",
                paddingBottom: "1.5rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <h1
                style={{
                  fontSize: "1.875rem",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                  marginBottom: "0.25rem",
                  letterSpacing: "-0.025em",
                }}
              >
                {isExtraContribution
                  ? "Aportación Extra"
                  : "Movimientos"}
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                {isExtraContribution
                  ? "Registra una aportación extra para reducir tu leverage y llevarlo de vuelta al rango."
                  : "Registra aportaciones o retiros de tu portfolio."}
              </p>
            </div>

            {/* Toggle Tabs */}
            {!isExtraContribution && (
              <div
                style={{
                  display: "flex",
                  gap: "0",
                  marginBottom: "1.5rem",
                  background: "var(--input-bg)",
                  borderRadius: "8px",
                  padding: "4px",
                  border: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setMovementType("contribution")}
                  style={{
                    flex: 1,
                    padding: "0.625rem 1rem",
                    background: movementType === "contribution"
                      ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                      : "transparent",
                    color: movementType === "contribution" ? "white" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.9375rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Aportación
                </button>
                <button
                  type="button"
                  onClick={() => setMovementType("withdrawal")}
                  style={{
                    flex: 1,
                    padding: "0.625rem 1rem",
                    background: movementType === "withdrawal"
                      ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                      : "transparent",
                    color: movementType === "withdrawal" ? "white" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "6px",
                    fontSize: "0.9375rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Retiro
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div
                style={{
                  background: "var(--input-bg)",
                  borderRadius: "16px",
                  padding: "2rem",
                  backdropFilter: "blur(10px)",
                }}
              >
                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "500",
                      marginBottom: "0.5rem",
                      color: "var(--text-on-glass)",
                    }}
                  >
                    {movementType === "withdrawal" ? "Cantidad de Retiro (USD)" : "Cantidad de Aportación (USD)"}
                  </label>
                  <NumberInput
                    value={amount}
                    onChange={(val) => setAmount(isNaN(val) ? 0 : val)}
                    min={0}
                    step={0.01}
                    decimals={2}
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: "var(--input-bg)",
                      color: "var(--input-color)",
                      border: "2px solid var(--input-border)",
                      borderRadius: "8px",
                      fontSize: "1.25rem",
                      boxSizing: "border-box",
                    }}
                    className="contribution-input"
                  />
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <label
                    style={{
                      display: "block",
                      fontWeight: "500",
                      marginBottom: "0.5rem",
                      color: "var(--text-on-glass)",
                    }}
                  >
                    Nota (opcional)
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="p.e. Diciembre 2025 DCA"
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: "var(--input-bg)",
                      color: "var(--input-color)",
                      border: "2px solid var(--input-border)",
                      borderRadius: "8px",
                      fontSize: "1rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {movementType === "withdrawal" && (
                  <div
                    style={{
                      marginBottom: "1.5rem",
                      padding: "0.75rem 1rem",
                      background: "rgba(239, 68, 68, 0.1)",
                      border: "1px solid rgba(239, 68, 68, 0.2)",
                      borderRadius: "8px",
                      color: "#f87171",
                      fontSize: "0.875rem",
                    }}
                  >
                    Un retiro reduce tu equity y aumenta tu leverage. Asegúrate de que el monto no exceda tu equity actual.
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    justifyContent: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="submit"
                    disabled={isSubmitting || !portfolioId}
                    style={{
                      padding: "0.875rem 2rem",
                      background:
                        isSubmitting || !portfolioId
                          ? "var(--disabled-bg)"
                          : movementType === "withdrawal"
                          ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                          : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color:
                        isSubmitting || !portfolioId
                          ? "var(--disabled-color)"
                          : "white",
                      border:
                        isSubmitting || !portfolioId
                          ? "1px solid var(--disabled-border)"
                          : "none",
                      borderRadius: "6px",
                      fontSize: "0.95rem",
                      fontWeight: "600",
                      opacity: isSubmitting || !portfolioId ? 0.5 : 1,
                      cursor:
                        isSubmitting || !portfolioId
                          ? "not-allowed"
                          : "pointer",
                      minHeight: "48px",
                    }}
                    className="submit-button"
                  >
                    {isSubmitting
                      ? "Guardando..."
                      : movementType === "withdrawal"
                      ? "Registrar Retiro"
                      : "Registrar Aportación"}
                  </button>
                </div>
              </div>
            </form>

            {message && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "rgba(74, 222, 128, 0.2)",
                  color: "#4ade80",
                  borderRadius: "8px",
                  border: "1px solid rgba(74, 222, 128, 0.3)",
                }}
              >
                {message}
              </div>
            )}

            {error && (
              <div
                style={{
                  marginTop: "1rem",
                  padding: "1rem",
                  background: "rgba(248, 113, 113, 0.2)",
                  color: "#f87171",
                  borderRadius: "8px",
                  border: "1px solid rgba(248, 113, 113, 0.3)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}
