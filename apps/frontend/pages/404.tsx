import React from "react";
import Head from "next/head";
import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <>
      <Head>
        <title>404 - Página no encontrada</title>
      </Head>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          padding: "2rem",
          background: "var(--bg-body)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "6rem",
            fontWeight: "700",
            color: "var(--text-dim)",
            lineHeight: 1,
            marginBottom: "0.5rem",
          }}
        >
          404
        </div>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: "600",
            color: "var(--text-primary)",
            marginBottom: "0.75rem",
          }}
        >
          Página no encontrada
        </h1>
        <p
          style={{
            color: "var(--text-muted)",
            fontSize: "1rem",
            marginBottom: "2rem",
            maxWidth: "400px",
          }}
        >
          La página que buscas no existe o ha sido movida.
        </p>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.5rem",
            background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
            color: "white",
            borderRadius: "8px",
            fontSize: "0.95rem",
            fontWeight: "600",
            textDecoration: "none",
            transition: "opacity 0.2s",
          }}
        >
          <Home size={18} />
          Ir al Dashboard
        </Link>
      </div>
    </>
  );
}
