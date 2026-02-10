import React, { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Image from "next/image";
import { SignInButton, SignUpButton, useUser } from "@clerk/nextjs";
import { useTheme } from "../contexts/ThemeContext";

/**
 * Login page — uses Clerk for magic link + Google OAuth
 */
export default function Home() {
  const router = useRouter();
  const { theme } = useTheme();
  const { isSignedIn, isLoaded } = useUser();

  // Redirect to dashboard if already signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push("/dashboard");
    }
  }, [isLoaded, isSignedIn, router]);

  // Loading state
  if (!isLoaded) {
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
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
            Cargando...
          </p>
        </div>
      </>
    );
  }

  // Already signed in — show redirect
  if (isSignedIn) {
    return (
      <>
        <Head>
          <title>Redirigiendo... - Margn</title>
        </Head>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            minHeight: "100vh",
          }}
        >
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
            Redirigiendo...
          </p>
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

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <SignInButton mode="modal">
              <button
                style={{
                  width: "100%",
                  padding: "0.875rem",
                  background: "var(--accent-blue)",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "var(--accent-blue)";
                }}
              >
                Iniciar Sesión
              </button>
            </SignInButton>

            <SignUpButton mode="modal">
              <button
                style={{
                  width: "100%",
                  padding: "0.875rem",
                  background: "transparent",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "0.95rem",
                  fontWeight: "600",
                  transition: "background 0.2s",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--hover-bg)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                Crear Cuenta
              </button>
            </SignUpButton>
          </div>

          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border)",
              textAlign: "center",
            }}
          >
            <p style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
              Autenticación segura con email o Google
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
