import React, { useState, FormEvent } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import { useAuth } from "../contexts/AuthContext";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Login page with passwordless authentication
 */
export default function Home() {
  const router = useRouter();
  const { user, signIn, loading } = useAuth();
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Redirect to dashboard if already logged in
  React.useEffect(() => {
    if (user && !loading) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await signIn(email);
      setMessage("✓ ¡Enlace mágico enviado! Revisa tu email para iniciar sesión.");
      setEmail("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al enviar el enlace mágico"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Head>
          <title>Cargando... - Margn</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Iniciar Sesión - Margn</title>
        <meta
          name="description"
          content="Inicia sesión para gestionar tu portfolio apalancado"
        />
      </Head>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "2rem",
        }}
        className="login-container"
      >
        <style jsx>{`
          @media (max-width: 768px) {
            .login-container {
              padding: 1rem !important;
            }
            .login-container > div {
              padding: 2rem 1.5rem !important;
            }
          }
          @media (max-width: 480px) {
            .login-container > div {
              padding: 1.5rem 1rem !important;
            }
            .login-container h1 {
              font-size: 1.5rem !important;
            }
          }
        `}</style>
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "3rem",
            maxWidth: "420px",
            width: "100%",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div style={{ marginBottom: "2rem", textAlign: "center" }}>
            <Image
              src={theme === "dark" ? "/margn-logo-white.png" : "/margn-logo.png"}
              alt="Margn"
              width={200}
              height={53}
              priority
              style={{ marginBottom: "0.25rem" }}
            />
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "0.875rem",
                fontWeight: "500",
              }}
            >
              Plataforma de Gestión de Portfolio
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label
              style={{
                display: "block",
                fontWeight: "500",
                marginBottom: "0.5rem",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              Dirección de Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                background: "var(--input-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--input-border)",
                borderRadius: "6px",
                fontSize: "0.95rem",
                marginBottom: "1.25rem",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.boxShadow = "0 0 0 3px rgba(59, 130, 246, 0.1)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#334155";
                e.target.style.boxShadow = "none";
              }}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                width: "100%",
                padding: "0.875rem",
                background: "var(--accent-blue)",
                color: "white",
                border: "none",
                borderRadius: "6px",
                fontSize: "0.95rem",
                fontWeight: "600",
                opacity: isSubmitting ? 0.7 : 1,
                transition: "background 0.2s",
              }}
              onMouseOver={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = "#2563eb";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "#3b82f6";
              }}
            >
              {isSubmitting ? "Enviando..." : "Enviar Enlace de Inicio de Sesión"}
            </button>
          </form>

          {message && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "rgba(34, 197, 94, 0.1)",
                color: "#22c55e",
                borderRadius: "6px",
                fontSize: "0.875rem",
                border: "1px solid rgba(34, 197, 94, 0.2)",
              }}
            >
              {message}
            </div>
          )}

          {error && (
            <div
              style={{
                marginTop: "1rem",
                padding: "0.75rem",
                background: "rgba(239, 68, 68, 0.1)",
                color: "#ef4444",
                borderRadius: "6px",
                fontSize: "0.875rem",
                border: "1px solid rgba(239, 68, 68, 0.2)",
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            <p style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              Autenticación segura sin contraseña
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
