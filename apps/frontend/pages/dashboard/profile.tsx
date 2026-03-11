import React, { useState, useEffect, FormEvent } from "react";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "../../lib/auth";
import { usePortfolio } from "../../contexts/PortfolioContext";
import { getProfile, updateProfile, UserProfile } from "../../lib/api";
import DashboardSidebar from "../../components/DashboardSidebar";
import AvatarUpload from "../../components/AvatarUpload";
import PlanBadge from "../../components/PlanBadge";
import { useSubscription } from "../../lib/hooks/use-subscription";
import { FileText, Bell, CreditCard } from "lucide-react";

/**
 * Profile page - User profile management
 */
export default function Profile() {
  const { user, loading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();
  const { tier, status, isTrialing, trialEndsAt } = useSubscription();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    notifyOnNotifications: true,
    notifyOnContributions: true,
    notifyOnLeverageAlerts: true,
    notifyOnRebalance: true,
  });

  // Load profile data
  useEffect(() => {
    async function loadProfile() {
      if (!user) return;

      setIsLoading(true);
      setError("");

      try {
        const profileData = await getProfile();
        setProfile(profileData);
        setFormData({
          fullName: profileData.fullName || "",
          notifyOnNotifications: profileData.notifyOnNotifications,
          notifyOnContributions: profileData.notifyOnContributions,
          notifyOnLeverageAlerts: profileData.notifyOnLeverageAlerts,
          notifyOnRebalance: profileData.notifyOnRebalance,
        });
      } catch (err) {
        console.error("Error loading profile:", err);
        const errorMessage = err instanceof Error ? err.message : "Error al cargar el perfil";
        if (errorMessage.includes("Invalid token") || errorMessage.includes("Unauthorized")) {
          setError("Error de autenticación. Por favor, cierra sesión y vuelve a iniciar sesión.");
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
      }
    }

    if (user) {
      loadProfile();
    }
  }, [user]);

  const handleInputChange = (
    field: keyof typeof formData,
    value: string | boolean
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const updated = await updateProfile({
        fullName: formData.fullName || undefined,
        notifyOnNotifications: formData.notifyOnNotifications,
        notifyOnContributions: formData.notifyOnContributions,
        notifyOnLeverageAlerts: formData.notifyOnLeverageAlerts,
        notifyOnRebalance: formData.notifyOnRebalance,
      });

      setProfile(updated);
      setMessage("✅ Perfil actualizado correctamente");

      setTimeout(() => {
        setMessage("");
      }, 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al actualizar el perfil"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || isLoading) {
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
          <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>Cargando...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Mi Perfil - Margn</title>
      </Head>
      <DashboardSidebar>
        <div style={{ padding: "2rem", paddingTop: "4rem" }}>
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
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
                Mi Perfil
              </h1>
              <p style={{ color: "var(--text-muted)", fontSize: "0.875rem" }}>
                Gestiona tu información personal y preferencias de notificaciones
              </p>
            </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: "1rem",
                background: "rgba(248, 113, 113, 0.1)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                borderRadius: "8px",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{ color: "#f87171", margin: 0 }}>{error}</p>
            </div>
          )}

          {/* Success Message */}
          {message && (
            <div
              style={{
                padding: "1rem",
                background: "rgba(74, 222, 128, 0.1)",
                border: "1px solid rgba(74, 222, 128, 0.3)",
                borderRadius: "8px",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{ color: "#4ade80", margin: 0 }}>{message}</p>
            </div>
          )}

          {/* Profile Form */}
          {profile && (
            <form onSubmit={handleSubmit}>
              {/* Avatar Section */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    marginBottom: "1.5rem",
                    textAlign: "center",
                  }}
                >
                  Foto de Perfil
                </h2>
                <AvatarUpload
                  currentAvatarUrl={profile.avatarUrl}
                  onUploadComplete={async (url) => {
                    try {
                      const updated = await updateProfile({ avatarUrl: url });
                      setProfile(updated);
                      setMessage("✅ Foto de perfil actualizada");
                      setTimeout(() => setMessage(""), 3000);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Error al actualizar la foto");
                    }
                  }}
                  size={120}
                />
              </div>

              {/* Personal Information */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <FileText size={18} />
                    Información Personal
                  </div>
                </h2>

                <div style={{ marginBottom: "1rem" }}>
                  <label
                    style={{
                      display: "block",
                      color: "var(--text-muted)",
                      fontSize: "0.875rem",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                    }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={profile.email}
                    disabled
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: "var(--disabled-bg)",
                      color: "var(--disabled-color)",
                      border: "1px solid var(--disabled-border)",
                      borderRadius: "6px",
                      fontSize: "0.9375rem",
                      cursor: "not-allowed",
                    }}
                  />
                  <p
                    style={{
                      color: "var(--text-dim)",
                      fontSize: "0.75rem",
                      marginTop: "0.25rem",
                      margin: 0,
                    }}
                  >
                    El email no se puede modificar
                  </p>
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      marginBottom: "0.5rem",
                      fontWeight: "500",
                    }}
                  >
                    Nombre Completo
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    placeholder="Tu nombre completo (opcional)"
                    disabled={isSubmitting}
                    style={{
                      width: "100%",
                      padding: "0.75rem 1rem",
                      background: "var(--input-bg)",
                      color: "var(--input-color)",
                      border: "2px solid var(--input-border)",
                      borderRadius: "6px",
                      fontSize: "0.9375rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Subscription */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <CreditCard size={18} />
                    Suscripción
                  </div>
                </h2>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <PlanBadge tier={tier} status={status} showStatus size="md" />
                    {isTrialing && trialEndsAt && (
                      <span style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                        Prueba hasta {trialEndsAt.toLocaleDateString("es-ES", { day: "numeric", month: "long" })}
                      </span>
                    )}
                  </div>
                  <Link
                    href="/dashboard/billing"
                    style={{
                      color: "#60a5fa",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      textDecoration: "none",
                    }}
                  >
                    Gestionar plan
                  </Link>
                </div>
              </div>

              {/* Notification Preferences */}
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "1.5rem",
                  marginBottom: "1.5rem",
                }}
              >
                <h2
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--text-primary)",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Bell size={18} />
                    Preferencias de Notificaciones
                  </div>
                </h2>

                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.notifyOnNotifications}
                      onChange={(e) =>
                        handleInputChange("notifyOnNotifications", e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "1.25rem",
                        height: "1.25rem",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                      }}
                    />
                    <div>
                      <div style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
                        Notificaciones de Estado
                      </div>
                      <div
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8125rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Recibe notificaciones cuando haya cambios relevantes en el estado de tu portfolio
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.notifyOnContributions}
                      onChange={(e) =>
                        handleInputChange("notifyOnContributions", e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "1.25rem",
                        height: "1.25rem",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                      }}
                    />
                    <div>
                      <div style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
                        Recordatorios de Aportaciones
                      </div>
                      <div
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8125rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Recibe recordatorios cuando sea el día de realizar una aportación periódica
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.notifyOnLeverageAlerts}
                      onChange={(e) =>
                        handleInputChange("notifyOnLeverageAlerts", e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "1.25rem",
                        height: "1.25rem",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                      }}
                    />
                    <div>
                      <div style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
                        Alertas de Leverage
                      </div>
                      <div
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8125rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Recibe alertas cuando el leverage efectivo esté fuera del rango configurado
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={formData.notifyOnRebalance}
                      onChange={(e) =>
                        handleInputChange("notifyOnRebalance", e.target.checked)
                      }
                      disabled={isSubmitting}
                      style={{
                        width: "1.25rem",
                        height: "1.25rem",
                        cursor: isSubmitting ? "not-allowed" : "pointer",
                      }}
                    />
                    <div>
                      <div style={{ color: "var(--text-secondary)", fontWeight: "500" }}>
                        Notificaciones de Rebalanceo
                      </div>
                      <div
                        style={{
                          color: "var(--text-dim)",
                          fontSize: "0.8125rem",
                          marginTop: "0.25rem",
                        }}
                      >
                        Recibe notificaciones cuando los cálculos detecten desviación en los pesos del portfolio
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Submit Button */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    padding: "0.75rem 2rem",
                    background: isSubmitting
                      ? "var(--disabled-bg)"
                      : "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: isSubmitting ? "var(--disabled-color)" : "white",
                    border: isSubmitting ? "1px solid var(--disabled-border)" : "none",
                    borderRadius: "6px",
                    fontSize: "0.9375rem",
                    fontWeight: "600",
                    cursor: isSubmitting ? "not-allowed" : "pointer",
                    opacity: isSubmitting ? 0.5 : 1,
                  }}
                >
                  {isSubmitting ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          )}
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}

