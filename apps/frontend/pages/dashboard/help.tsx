import React from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useAuth } from "../../contexts/AuthContext";
import DashboardSidebar from "../../components/DashboardSidebar";
import { usePortfolio } from "../../contexts/PortfolioContext";
import {
  BookOpen,
  PlayCircle,
  Calendar,
  DollarSign,
  Edit,
  Scale,
  Settings,
  Plus,
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Info,
  BarChart3,
  Bookmark,
  LayoutDashboard,
} from "lucide-react";

/**
 * Help page - Complete user guide with workflow diagrams
 */
export default function Help() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { activePortfolioId: portfolioId } = usePortfolio();

  // Redirect if not authenticated
  React.useEffect(() => {
    if (!loading && !user) {
      router.push("/");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <>
        <Head>
          <title>Cargando... - Ayuda</title>
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

  if (!user) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Ayuda - Margn</title>
      </Head>
      <DashboardSidebar>
        <div style={{ padding: "2rem", paddingTop: "4rem", maxWidth: "1200px", margin: "0 auto" }}>
          {/* Header */}
          <div
            style={{
              marginBottom: "2rem",
              paddingBottom: "1.5rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                marginBottom: "0.5rem",
              }}
            >
              <BookOpen size={32} color="#60a5fa" />
              <h1
                style={{
                  fontSize: "2rem",
                  fontWeight: "700",
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                Guía de Ayuda
              </h1>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "1rem" }}>
              Aprende a usar la aplicación y gestiona tu portfolio de forma
              eficiente
            </p>
          </div>

          {/* Table of Contents */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.5rem",
              marginBottom: "2rem",
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
              Índice
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                gap: "0.75rem",
              }}
            >
              {[
                { id: "initial-setup", label: "1. Configuración Inicial" },
                { id: "monthly-workflow", label: "2. Operativa Mensual" },
                { id: "contributions", label: "3. Contribuciones" },
                { id: "updates", label: "4. Actualizaciones" },
                { id: "rebalancing", label: "5. Rebalanceo" },
                { id: "new-assets", label: "6. Añadir Activos" },
                { id: "recommendations", label: "7. Recomendaciones" },
                { id: "backtest", label: "8. Backtest" },
                { id: "strategies", label: "9. Estrategias" },
              ].map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  style={{
                    color: "#60a5fa",
                    textDecoration: "none",
                    fontSize: "0.9375rem",
                    padding: "0.5rem",
                    borderRadius: "6px",
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(96, 165, 250, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>

          {/* Section 1: Initial Setup */}
          <Section
            id="initial-setup"
            title="1. Configuración Inicial"
            icon={PlayCircle}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Cuando creas tu cuenta por primera vez, un asistente de
              configuración te guía paso a paso para crear tu portfolio.
            </p>

            <StepList>
              <Step number={1}>
                <strong>Inicia sesión</strong> con tu email usando el enlace
                mágico que recibirás por correo.
              </Step>
              <Step number={2}>
                <strong>Selecciona tu perfil de riesgo:</strong> El asistente
                te presenta cuatro perfiles predefinidos:
                <ul style={{ marginTop: "0.75rem", paddingLeft: "1.5rem" }}>
                  <li><strong>Conservador:</strong> Leverage 1.5x-2.5x, menor volatilidad</li>
                  <li><strong>Moderado:</strong> Leverage 2x-3x, balance riesgo/retorno</li>
                  <li><strong>Crecimiento:</strong> Leverage 2.5x-3.5x, mayor exposición</li>
                  <li><strong>Agresivo:</strong> Leverage 3x-4.5x, máximo potencial</li>
                </ul>
              </Step>
              <Step number={3}>
                <strong>Elige una estrategia:</strong> Puedes elegir entre
                estrategias de la plataforma (pre-configuradas y con backtest)
                o crear una personalizada con tus propios activos y pesos.
              </Step>
              <Step number={4}>
                <strong>Configura los parámetros básicos:</strong>
                <ul style={{ marginTop: "0.75rem", paddingLeft: "1.5rem" }}>
                  <li><strong>Capital inicial:</strong> El dinero con el que empiezas</li>
                  <li><strong>Aportación mensual:</strong> Cantidad que contribuirás cada mes</li>
                  <li><strong>Día de aportación:</strong> Día del mes para la contribución</li>
                </ul>
              </Step>
              <Step number={5}>
                <strong>Verifica el resumen</strong> y confirma. El sistema
                creará tu portfolio con toda la configuración y descargará
                el histórico de precios de tus activos.
              </Step>
              <Step number={6}>
                <strong>Registra tus posiciones iniciales</strong> en{" "}
                <em>Actualización Manual</em>:
                <ul style={{ marginTop: "0.75rem", paddingLeft: "1.5rem" }}>
                  <li>Equity actual (capital disponible)</li>
                  <li>Cantidad de cada activo que posees</li>
                  <li>Precio medio de compra de cada activo</li>
                </ul>
              </Step>
            </StepList>
          </Section>

          {/* Section 2: Monthly Workflow */}
          <Section
            id="monthly-workflow"
            title="2. Operativa Mensual"
            icon={Calendar}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              La operativa mensual sigue un flujo específico diseñado para
              mantener tu portfolio optimizado. Aquí está el diagrama del proceso:
            </p>

            {/* Workflow Diagram */}
            <div
              style={{
                background: "var(--bg-sidebar)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "2rem",
                marginBottom: "2rem",
                overflowX: "auto",
              }}
            >
              <WorkflowDiagram />
            </div>

            <div
              style={{
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <Info size={20} color="#60a5fa" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#60a5fa",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Importante
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Las contribuciones se añaden directamente al equity. El
                    sistema evalúa el <strong>leverage actual</strong> para decidir
                    si aumentar exposición (si leverage {"<"} mínimo) o mantenerla
                    constante (si está en rango o por encima).
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 3: Contributions */}
          <Section
            id="contributions"
            title="3. Contribuciones Mensuales"
            icon={DollarSign}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Las contribuciones son el dinero que añades periódicamente a tu
              portfolio. El sistema las registra pero las despliega
              condicionalmente.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Cómo registrar una contribución
            </h3>
            <StepList>
              <Step number={1}>
                Ve a <strong>Añadir Aportación</strong> en el menú lateral
              </Step>
              <Step number={2}>
                Introduce la cantidad que vas a aportar este mes
              </Step>
              <Step number={3}>
                Opcionalmente, añade una nota (ej: "Aportación noviembre 2025")
              </Step>
              <Step number={4}>
                Haz clic en <strong>Registrar Aportación</strong>
              </Step>
            </StepList>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              ¿Cómo se gestionan las contribuciones?
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              La gestión de contribuciones se basa en el leverage actual:
            </p>
            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              {[
                {
                  title: "Leverage < Mínimo",
                  description:
                    "El leverage está por debajo del mínimo configurado. Se aumenta la exposición (reborrow) hasta alcanzar el leverage objetivo.",
                  color: "#eab308",
                },
                {
                  title: "Leverage en Rango",
                  description:
                    "El leverage está entre el mínimo y máximo. La exposición se mantiene constante, el equity aumenta con la contribución.",
                  color: "#22c55e",
                },
                {
                  title: "Leverage > Máximo",
                  description:
                    "El leverage está por encima del máximo. La contribución se usa como colateral adicional sin aumentar exposición, reduciendo el leverage.",
                  color: "#ef4444",
                },
              ].map((signal, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--hover-bg)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: signal.color,
                      }}
                    />
                    <strong style={{ color: "var(--text-primary)" }}>{signal.title}</strong>
                  </div>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      margin: 0,
                    }}
                  >
                    {signal.description}
                  </p>
                </div>
              ))}
            </div>

            <div
              style={{
                background: "rgba(139, 92, 246, 0.1)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <AlertCircle size={20} color="#a78bfa" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#a78bfa",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Aportación Extra
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Si el leverage está por encima del máximo (4.0x), el sistema
                    puede recomendar una aportación extra. Esta aportación se usa
                    como colateral adicional sin aumentar la exposición, reduciendo
                    así el leverage.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 4: Updates */}
          <Section id="updates" title="4. Actualizaciones Manuales" icon={Edit}>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Las actualizaciones manuales registran el estado real de tu
              portfolio después de ejecutar operaciones en tu broker.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Cuándo actualizar
            </h3>
            <ul
              style={{
                color: "var(--text-secondary)",
                paddingLeft: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <li>
                <strong>Después de un rebalanceo:</strong> Una vez ejecutadas las
                operaciones en tu broker
              </li>
              <li>
                <strong>Después de una aportación:</strong> Cuando hayas
                desplegado el capital y comprado activos
              </li>
              <li>
                <strong>Mensualmente:</strong> Para mantener los datos actualizados
                y que las métricas sean precisas
              </li>
              <li>
                <strong>Si cambias posiciones manualmente:</strong> Cualquier
                compra/venta fuera del sistema
              </li>
            </ul>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Cómo actualizar
            </h3>
            <StepList>
              <Step number={1}>
                Ve a <strong>Actualización Manual</strong> en el menú
              </Step>
              <Step number={2}>
                Introduce el <strong>Equity actual</strong> (capital disponible
                en tu broker)
              </Step>
              <Step number={3}>
                Para cada activo, actualiza:
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
                  <li>
                    <strong>Cantidad:</strong> Número de unidades que posees
                  </li>
                  <li>
                    <strong>Precio medio:</strong> Precio promedio de compra
                    (se calcula automáticamente si no lo cambias)
                  </li>
                </ul>
              </Step>
              <Step number={4}>
                Si necesitas añadir un activo nuevo, usa el botón{" "}
                <strong>+ Añadir Activo</strong> (ver sección 6)
              </Step>
              <Step number={5}>
                Haz clic en <strong>Actualizar Posiciones</strong>
              </Step>
            </StepList>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginTop: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <Info size={20} color="#fbbf24" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#fbbf24",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Precio Medio Automático
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Si el precio medio es 0 o no lo cambias, el sistema usará el
                    precio actual del activo. Para activos nuevos, esto es útil.
                    Para posiciones existentes, mantén el precio medio real para
                    calcular correctamente el PnL.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 5: Rebalancing */}
          <Section
            id="rebalancing"
            title="5. Rebalanceo del Portfolio"
            icon={Scale}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              El rebalanceo ajusta las posiciones para mantener los pesos
              objetivo y el leverage dentro del rango deseado.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Cómo funciona el rebalanceo
            </h3>
            <StepList>
              <Step number={1}>
                Ve a <strong>Rebalancear Portfolio</strong> en el menú
              </Step>
              <Step number={2}>
                El sistema calcula automáticamente:
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
                  <li>Estado actual vs. estado objetivo</li>
                  <li>Leverage actual y si está fuera del rango configurado</li>
                  <li>Exposición objetivo según el leverage</li>
                  <li>Optimización de pesos (Sharpe Ratio si está habilitado)</li>
                </ul>
              </Step>
              <Step number={3}>
                Revisa la propuesta:
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
                  <li>
                    <strong>Instrucciones:</strong> Qué comprar/vender y en qué
                    cantidad
                  </li>
                  <li>
                    <strong>Equity usado:</strong> Cuánto capital se usará
                  </li>
                  <li>
                    <strong>Borrow usado:</strong> Cuánto se pedirá prestado
                  </li>
                  <li>
                    <strong>Contribuciones usadas:</strong> Qué aportaciones se
                    marcarán como desplegadas
                  </li>
                </ul>
              </Step>
              <Step number={4}>
                <strong>Ejecuta las operaciones en tu broker</strong> según las
                instrucciones
              </Step>
              <Step number={5}>
                Vuelve a <strong>Actualización Manual</strong> y actualiza las
                posiciones con los valores reales
              </Step>
              <Step number={6}>
                Regresa a <strong>Rebalancear</strong> y haz clic en{" "}
                <strong>Aceptar y Guardar</strong> para registrar el rebalanceo
              </Step>
            </StepList>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Optimización de Pesos
            </h3>
            <div
              style={{
                background: "var(--hover-bg)",
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: "8px",
                padding: "1rem",
                marginBottom: "1.5rem",
              }}
            >
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                Puedes elegir entre dos modos de optimización en la{" "}
                <strong>Configuración</strong>:
              </p>
              <ul
                style={{
                  color: "var(--text-secondary)",
                  fontSize: "0.9375rem",
                  paddingLeft: "1.5rem",
                  marginTop: "0.75rem",
                }}
              >
                <li>
                  <strong>Pesos estáticos:</strong> Usa los pesos objetivo que
                  configuraste manualmente
                </li>
                <li>
                  <strong>Optimización Sharpe dinámica:</strong> El sistema
                  optimiza los pesos usando el algoritmo de Sharpe Ratio
                  (Nelder-Mead) con:
                  <ul
                    style={{
                      paddingLeft: "1.5rem",
                      marginTop: "0.5rem",
                    }}
                  >
                    <li>60% de shrinkage en retornos medios (conservadurismo)</li>
                    <li>Tasa libre de riesgo: 2%</li>
                    <li>Restricciones: mínimo 5%, máximo 40% por activo</li>
                  </ul>
                </li>
              </ul>
            </div>
            <div
              style={{
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginTop: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <Info size={20} color="#60a5fa" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#60a5fa",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Recomendación
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Se recomienda usar la optimización Sharpe desde el principio.
                    Una vez que el algoritmo sugiera los pesos optimizados, puedes
                    copiarlos manualmente a los pesos objetivo estáticos si prefieres
                    mantener un control más directo sobre la asignación.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 6: New Assets */}
          <Section
            id="new-assets"
            title="6. Añadir un Activo Nuevo"
            icon={Plus}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Puedes añadir nuevos activos a tu portfolio en cualquier momento.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Pasos para añadir un activo
            </h3>
            <StepList>
              <Step number={1}>
                Ve a <strong>Actualización Manual</strong>
              </Step>
              <Step number={2}>
                Haz clic en <strong>+ Añadir Activo</strong>
              </Step>
              <Step number={3}>
                Busca el símbolo del activo (ej: "SPY", "GLD", "BTC-USD")
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
                  <li>
                    El sistema busca en la base de datos de activos disponibles
                  </li>
                  <li>
                    Si el activo no existe, puedes introducir el símbolo
                    manualmente
                  </li>
                </ul>
              </Step>
              <Step number={4}>
                Selecciona el activo de los resultados de búsqueda
              </Step>
              <Step number={5}>
                Introduce la cantidad que posees y el precio medio
              </Step>
              <Step number={6}>
                <strong>Actualiza la configuración:</strong> Ve a{" "}
                <strong>Configuración</strong> y añade el nuevo activo a los
                pesos objetivo
              </Step>
            </StepList>

            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginTop: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <CheckCircle size={20} color="#22c55e" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#22c55e",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Activos Soportados
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    La aplicación soporta activos de Yahoo Finance: acciones,
                    ETFs, criptomonedas, commodities, índices y bonos. El símbolo
                    debe coincidir con el de Yahoo Finance (ej: "BTC-USD" para
                    Bitcoin).
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 7: Recommendations */}
          <Section
            id="recommendations"
            title="7. Sistema de Recomendaciones"
            icon={AlertCircle}
          >
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              El sistema genera recomendaciones automáticas basadas en el estado
              actual de tu portfolio. Estas aparecen en el dashboard principal.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Tipos de recomendaciones
            </h3>
            <div style={{ display: "grid", gap: "1rem", marginBottom: "1.5rem" }}>
              {[
                {
                  type: "Leverage Bajo",
                  priority: "alta",
                  description:
                    "El leverage está por debajo del mínimo configurado. Necesitas reborrow y comprar más activos para aumentar la exposición.",
                  action: "Ir a Rebalancear",
                  color: "#eab308",
                },
                {
                  type: "Leverage Alto",
                  priority: "urgente",
                  description:
                    "El leverage está por encima del máximo configurado. Necesitas una aportación extra como colateral para reducir el leverage.",
                  action: "Ir a Añadir Aportación (extra)",
                  color: "#ef4444",
                },
                {
                  type: "Rebalanceo Necesario",
                  priority: "media",
                  description:
                    "Los pesos actuales se desvían significativamente de los objetivos. Considera rebalancear.",
                  action: "Ir a Rebalancear",
                  color: "#3b82f6",
                },
                {
                  type: "Aportación Debida",
                  priority: "media",
                  description:
                    "Es el día programado para tu aportación mensual.",
                  action: "Ir a Añadir Aportación",
                  color: "#22c55e",
                },
              ].map((rec, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--hover-bg)",
                    border: `1px solid ${rec.color}40`,
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                      }}
                    >
                      <div
                        style={{
                          width: "12px",
                          height: "12px",
                          borderRadius: "50%",
                          background: rec.color,
                        }}
                      />
                      <strong style={{ color: "var(--text-primary)" }}>{rec.type}</strong>
                    </div>
                    <span
                      style={{
                        background: rec.color,
                        color: "var(--text-primary)",
                        fontSize: "0.7rem",
                        fontWeight: "700",
                        padding: "0.25rem 0.5rem",
                        borderRadius: "4px",
                      }}
                    >
                      {rec.priority.toUpperCase()}
                    </span>
                  </div>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      marginBottom: rec.action ? "0.5rem" : 0,
                    }}
                  >
                    {rec.description}
                  </p>
                  {rec.action && (
                    <p
                      style={{
                        color: rec.color,
                        fontSize: "0.8125rem",
                        fontWeight: "600",
                        margin: 0,
                      }}
                    >
                      → {rec.action}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          {/* Section 8: Backtest */}
          <Section id="backtest" title="8. Simulador de Backtest" icon={BarChart3}>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              El backtest permite simular cómo habría funcionado tu estrategia de
              inversión con datos históricos reales. Esto te ayuda a evaluar
              diferentes configuraciones antes de aplicarlas a tu portfolio real.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Cómo usar el backtest
            </h3>
            <StepList>
              <Step number={1}>
                Ve a <strong>Backtest</strong> en el menú lateral
              </Step>
              <Step number={2}>
                <strong>Configura los parámetros:</strong>
                <ul style={{ marginTop: "0.75rem", paddingLeft: "1.5rem" }}>
                  <li>
                    <strong>Activos:</strong> Selecciona los símbolos a incluir
                    (ej: SPY, GLD, BTC-USD)
                  </li>
                  <li>
                    <strong>Capital inicial:</strong> Monto con el que empezarías
                  </li>
                  <li>
                    <strong>Aportación mensual:</strong> Contribución periódica
                  </li>
                  <li>
                    <strong>Leverage:</strong> Rango mínimo, máximo y objetivo
                  </li>
                  <li>
                    <strong>Período:</strong> Fecha de inicio y fin de la simulación
                  </li>
                  <li>
                    <strong>Ventana:</strong> Duración de cada simulación (36-84 meses)
                  </li>
                </ul>
              </Step>
              <Step number={3}>
                <strong>Selecciona el modo de pesos:</strong>
                <ul style={{ marginTop: "0.5rem", paddingLeft: "1.5rem" }}>
                  <li>
                    <strong>Sharpe:</strong> Optimización automática basada en
                    Sharpe Ratio
                  </li>
                  <li>
                    <strong>Equal:</strong> Pesos iguales para todos los activos
                  </li>
                  <li>
                    <strong>Manual:</strong> Pesos personalizados que tú defines
                  </li>
                </ul>
              </Step>
              <Step number={4}>
                Haz clic en <strong>Ejecutar Backtest</strong> y espera a que
                se complete la simulación
              </Step>
            </StepList>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Interpretando los resultados
            </h3>
            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              {[
                {
                  title: "Percentiles P10, P50, P90",
                  description:
                    "El backtest ejecuta múltiples ventanas temporales. P10 es el peor 10%, P50 es la mediana, y P90 es el mejor 10%. Esto te da una visión realista del rango de resultados posibles.",
                  color: "#3b82f6",
                },
                {
                  title: "CAGR (Retorno Anualizado)",
                  description:
                    "Tasa de crecimiento anual compuesto. Un CAGR del 15% significa que tu inversión creció en promedio un 15% cada año.",
                  color: "#22c55e",
                },
                {
                  title: "Sharpe Ratio",
                  description:
                    "Mide el retorno ajustado por riesgo. Un Sharpe > 1 es bueno, > 2 es excelente. Compara cuánto rendimiento obtienes por cada unidad de riesgo.",
                  color: "#8b5cf6",
                },
                {
                  title: "Max Drawdown",
                  description:
                    "La máxima caída desde un pico hasta un valle. Un drawdown del -30% significa que en el peor momento perdiste 30% desde tu máximo.",
                  color: "#ef4444",
                },
                {
                  title: "Días Bajo el Agua",
                  description:
                    "Número de días en que tu equity estuvo por debajo de lo que habías invertido. Menos días = recuperación más rápida.",
                  color: "#f59e0b",
                },
              ].map((metric, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--hover-bg)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: metric.color,
                      }}
                    />
                    <strong style={{ color: "var(--text-primary)" }}>
                      {metric.title}
                    </strong>
                  </div>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      margin: 0,
                    }}
                  >
                    {metric.description}
                  </p>
                </div>
              ))}
            </div>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Score y Análisis IA
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Después de ejecutar un backtest, el sistema calcula un{" "}
              <strong>score compuesto (0-100)</strong> que evalúa la calidad de
              la estrategia en cuatro dimensiones: consistencia, riesgo/retorno,
              Sharpe y drawdown.
            </p>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              También puedes generar un <strong>Análisis IA</strong> que conecta
              los resultados numéricos con eventos macro y ciclos de mercado
              específicos del período evaluado, proporcionando contexto y
              recomendaciones accionables.
            </p>

            <div
              style={{
                background: "rgba(59, 130, 246, 0.1)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <Info size={20} color="#60a5fa" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#60a5fa",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Pesos Dinámicos
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Activa la opción <strong>Pesos dinámicos</strong> para que el
                    optimizador recalcule los pesos mensualmente usando una ventana
                    histórica móvil. Esto adapta la estrategia a las condiciones
                    cambiantes del mercado.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Section 9: Strategies */}
          <Section id="strategies" title="9. Gestión de Estrategias" icon={Bookmark}>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Las estrategias te permiten guardar configuraciones de backtest,
              explorar estrategias de la plataforma y de la comunidad, y aplicarlas
              directamente a tu portfolio.
            </p>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Tres pestañas de estrategias
            </h3>
            <div
              style={{
                display: "grid",
                gap: "0.75rem",
                marginBottom: "1.5rem",
              }}
            >
              {[
                {
                  title: "Mis Estrategias",
                  description:
                    "Estrategias que has guardado desde tus propios backtests. Puedes editarlas, hacerlas públicas o eliminarlas.",
                  color: "#3b82f6",
                },
                {
                  title: "Plataforma",
                  description:
                    "Estrategias pre-configuradas por la plataforma, organizadas por perfil de riesgo (Conservador, Moderado, Crecimiento, Agresivo). Incluyen backtest y análisis IA.",
                  color: "#8b5cf6",
                },
                {
                  title: "Comunidad",
                  description:
                    "Estrategias compartidas públicamente por otros usuarios. Puedes ver sus métricas y aplicarlas a tu portfolio.",
                  color: "#10b981",
                },
              ].map((tab, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "var(--hover-bg)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "8px",
                    padding: "1rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: tab.color,
                      }}
                    />
                    <strong style={{ color: "var(--text-primary)" }}>{tab.title}</strong>
                  </div>
                  <p
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      margin: 0,
                    }}
                  >
                    {tab.description}
                  </p>
                </div>
              ))}
            </div>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Guardar una estrategia
            </h3>
            <StepList>
              <Step number={1}>
                Ejecuta un backtest con la configuración que quieras guardar
              </Step>
              <Step number={2}>
                Una vez completado, haz clic en <strong>Guardar Estrategia</strong>
              </Step>
              <Step number={3}>
                Asigna un <strong>nombre descriptivo</strong> (ej: &quot;SPY+GLD
                Conservador 3x&quot;)
              </Step>
              <Step number={4}>
                Opcionalmente añade una <strong>descripción</strong> explicando
                la lógica de la estrategia
              </Step>
              <Step number={5}>
                Confirma para guardar. La estrategia aparecerá en tu lista.
              </Step>
            </StepList>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Detalle de estrategia
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1rem" }}>
              Al hacer clic en una estrategia verás:
            </p>
            <ul
              style={{
                color: "var(--text-secondary)",
                paddingLeft: "1.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <li>
                <strong>Configuración completa:</strong> Capital, contribución,
                leverage, pesos y modo de optimización
              </li>
              <li>
                <strong>Trayectorias P10/P50/P90:</strong> Gráfica visual de
                cómo evolucionó el equity en cada escenario
              </li>
              <li>
                <strong>Métricas detalladas:</strong> CAGR, Sharpe, drawdown,
                recovery days, XIRR y score compuesto
              </li>
              <li>
                <strong>Análisis IA:</strong> Genera un análisis estructural
                de la estrategia con inteligencia artificial. Se guarda
                automáticamente para futuras visitas.
              </li>
              <li>
                <strong>Nuevo backtest:</strong> Re-ejecuta el backtest con la
                misma configuración (útil con datos más recientes)
              </li>
              <li>
                <strong>Aplicar a portfolio:</strong> Actualiza los pesos
                objetivo de tu portfolio con los de la estrategia y añade
                activos faltantes
              </li>
            </ul>

            <h3
              style={{
                fontSize: "1.125rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                marginTop: "1.5rem",
                marginBottom: "0.75rem",
              }}
            >
              Visibilidad
            </h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Tus estrategias son <strong>privadas</strong> por defecto. Puedes
              cambiar la visibilidad a <strong>pública</strong> para que otros
              usuarios las vean en la pestaña de Comunidad. Haz clic en la
              etiqueta &quot;Privada&quot;/&quot;Pública&quot; en el detalle de la estrategia.
            </p>

            <div
              style={{
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginTop: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <CheckCircle size={20} color="#22c55e" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#22c55e",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Buenas prácticas
                  </p>
                  <ul
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: "0.9375rem",
                      paddingLeft: "1.25rem",
                      margin: 0,
                    }}
                  >
                    <li>
                      Explora las estrategias de plataforma como punto de partida
                    </li>
                    <li>
                      Compara el Sharpe ratio y score entre estrategias, no solo el
                      retorno
                    </li>
                    <li>
                      Usa el análisis IA para entender las fortalezas y riesgos
                      de cada estrategia
                    </li>
                    <li>
                      Presta atención al max drawdown para evaluar el riesgo real
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "rgba(139, 92, 246, 0.1)",
                border: "1px solid rgba(139, 92, 246, 0.3)",
                borderRadius: "8px",
                padding: "1rem",
                marginTop: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.75rem",
                }}
              >
                <AlertCircle size={20} color="#a78bfa" style={{ flexShrink: 0 }} />
                <div>
                  <p
                    style={{
                      color: "#a78bfa",
                      fontWeight: "600",
                      marginBottom: "0.5rem",
                    }}
                  >
                    Limitaciones del backtest
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9375rem" }}>
                    Los resultados pasados no garantizan resultados futuros. El
                    backtest no incluye costes de financiación del margen ni
                    comisiones de broker. Úsalo como herramienta de evaluación,
                    no como predicción.
                  </p>
                </div>
              </div>
            </div>
          </Section>

          {/* Quick Actions */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.5rem",
              marginTop: "2rem",
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
              Acciones Rápidas
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "1rem",
              }}
            >
              {[
                {
                  label: "Dashboard",
                  path: `/dashboard?portfolioId=${portfolioId}`,
                  icon: LayoutDashboard,
                },
                {
                  label: "Añadir Aportación",
                  path: `/dashboard/contribution?portfolioId=${portfolioId}`,
                  icon: DollarSign,
                },
                {
                  label: "Rebalancear",
                  path: `/dashboard/rebalance?portfolioId=${portfolioId}`,
                  icon: Scale,
                },
                {
                  label: "Backtest",
                  path: `/dashboard/backtest?portfolioId=${portfolioId}`,
                  icon: BarChart3,
                },
                {
                  label: "Estrategias",
                  path: `/dashboard/strategies?portfolioId=${portfolioId}`,
                  icon: Bookmark,
                },
                {
                  label: "Configuración",
                  path: `/dashboard/configuration?portfolioId=${portfolioId}`,
                  icon: Settings,
                },
              ].map((action) => (
                <button
                  key={action.path}
                  onClick={() => router.push(action.path)}
                  style={{
                    padding: "1rem",
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: "8px",
                    color: "#60a5fa",
                    fontSize: "0.9375rem",
                    fontWeight: "500",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      "rgba(59, 130, 246, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      "rgba(59, 130, 246, 0.1)";
                  }}
                >
                  <action.icon size={20} />
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DashboardSidebar>
    </>
  );
}

/**
 * Section component for help sections
 */
function Section({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        padding: "2rem",
        marginBottom: "2rem",
        scrollMarginTop: "2rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1.5rem",
          paddingBottom: "1rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <Icon size={28} color="#60a5fa" />
        <h2
          style={{
            fontSize: "1.5rem",
            fontWeight: "700",
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * Step list component
 */
function StepList({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {children}
    </div>
  );
}

/**
 * Step component
 */
function Step({
  number,
  children,
}: {
  number: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          background: "rgba(96, 165, 250, 0.2)",
          border: "2px solid #60a5fa",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#60a5fa",
          fontWeight: "700",
          fontSize: "0.875rem",
          flexShrink: 0,
        }}
      >
        {number}
      </div>
      <div style={{ flex: 1, color: "var(--text-secondary)", lineHeight: "1.6" }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Workflow Diagram Component
 * Shows the monthly operational flow
 */
function WorkflowDiagram() {
  const width = 1000;
  const height = 900;
  const nodeWidth = 180;
  const nodeHeight = 80;
  const spacingX = 220;
  const spacingY = 140;

  // Node positions
  const nodes = [
    { id: "start", x: width / 2, y: 40, label: "Inicio del Mes", type: "start" },
    {
      id: "contribution",
      x: width / 2,
      y: 180,
      label: "Registrar\nAportación",
      type: "action",
    },
    {
      id: "check-signals",
      x: width / 2,
      y: 320,
      label: "¿Leverage\n< Mínimo?",
      type: "decision",
    },
    {
      id: "signal-yes",
      x: width / 2 - spacingX,
      y: 480,
      label: "Aumentar\nExposición",
      type: "signal",
    },
    {
      id: "signal-no",
      x: width / 2 + spacingX,
      y: 480,
      label: "Mantener\nExposición",
      type: "wait",
    },
    {
      id: "rebalance",
      x: width / 2 - spacingX,
      y: 620,
      label: "Rebalancear\nPortfolio",
      type: "action",
    },
    {
      id: "update",
      x: width / 2 - spacingX,
      y: 760,
      label: "Actualizar\nPosiciones",
      type: "action",
    },
    {
      id: "end",
      x: width / 2,
      y: 760,
      label: "Fin del Mes",
      type: "end",
    },
  ];

  // Connections
  const connections = [
    { from: "start", to: "contribution" },
    { from: "contribution", to: "check-signals" },
    { from: "check-signals", to: "signal-yes", label: "Sí" },
    { from: "check-signals", to: "signal-no", label: "No" },
    { from: "signal-yes", to: "rebalance" },
    { from: "rebalance", to: "update" },
    { from: "signal-no", to: "end" },
    { from: "update", to: "end" },
  ];

  const getNodeColor = (type: string) => {
    switch (type) {
      case "start":
      case "end":
        return { fill: "#22c55e", stroke: "#16a34a" };
      case "action":
        return { fill: "#3b82f6", stroke: "#2563eb" };
      case "decision":
        return { fill: "#f59e0b", stroke: "#d97706" };
      case "signal":
        return { fill: "#8b5cf6", stroke: "#7c3aed" };
      case "wait":
        return { fill: "#64748b", stroke: "#475569" };
      default:
        return { fill: "#1e293b", stroke: "#334155" };
    }
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", height: "auto" }}
    >
      {/* Draw connections */}
      {connections.map((conn, idx) => {
        const fromNode = nodes.find((n) => n.id === conn.from);
        const toNode = nodes.find((n) => n.id === conn.to);
        if (!fromNode || !toNode) return null;

        const fromY =
          fromNode.y + (fromNode.id === "check-signals" ? nodeHeight : nodeHeight / 2);
        const toY = toNode.y + (toNode.id === "check-signals" ? 0 : nodeHeight / 2);

        // For decision node, create angled connections
        let path = "";
        if (fromNode.id === "check-signals") {
          const midX = (fromNode.x + toNode.x) / 2;
          path = `M ${fromNode.x} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toNode.x} ${toY}`;
        } else {
          path = `M ${fromNode.x} ${fromY} L ${toNode.x} ${toY}`;
        }

        return (
          <g key={idx}>
            <path
              d={path}
              fill="none"
              stroke="#475569"
              strokeWidth="2"
              markerEnd="url(#arrowhead)"
            />
            {conn.label && (
              <text
                x={(fromNode.x + toNode.x) / 2}
                y={(fromY + toY) / 2 - 5}
                fill="#94a3b8"
                fontSize="12"
                textAnchor="middle"
                fontWeight="600"
              >
                {conn.label}
              </text>
            )}
          </g>
        );
      })}

      {/* Arrow marker */}
      <defs>
        <marker
          id="arrowhead"
          markerWidth="10"
          markerHeight="10"
          refX="9"
          refY="3"
          orient="auto"
        >
          <polygon points="0 0, 10 3, 0 6" fill="#475569" />
        </marker>
      </defs>

      {/* Draw nodes */}
      {nodes.map((node) => {
        const colors = getNodeColor(node.type);
        return (
          <g key={node.id}>
            <rect
              x={node.x - nodeWidth / 2}
              y={node.y}
              width={nodeWidth}
              height={nodeHeight}
              rx="8"
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth="2"
            />
            <text
              x={node.x}
              y={node.y + nodeHeight / 2}
              fill="white"
              fontSize="13"
              fontWeight="600"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {node.label.split("\n").map((line, i) => (
                <tspan
                  key={i}
                  x={node.x}
                  dy={i === 0 ? 0 : 16}
                  dominantBaseline="middle"
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}

      {/* Legend */}
      <g transform={`translate(${width - 200}, 220)`}>
        <text
          x="0"
          y="0"
          fill="#f1f5f9"
          fontSize="14"
          fontWeight="700"
          dominantBaseline="hanging"
        >
          Leyenda:
        </text>
        {[
          { label: "Inicio/Fin", color: "#22c55e" },
          { label: "Acción", color: "#3b82f6" },
          { label: "Decisión", color: "#f59e0b" },
          { label: "Señal", color: "#8b5cf6" },
          { label: "Esperar", color: "#64748b" },
        ].map((item, idx) => (
          <g key={idx} transform={`translate(0, ${25 + idx * 25})`}>
            <rect
              x="0"
              y="0"
              width="16"
              height="16"
              rx="3"
              fill={item.color}
            />
            <text
              x="24"
              y="12"
              fill="#cbd5e1"
              fontSize="12"
              dominantBaseline="middle"
            >
              {item.label}
            </text>
          </g>
        ))}
      </g>

      {/* Additional info boxes */}
      <g transform={`translate(40, 40)`}>
        <rect
          x="0"
          y="0"
          width="280"
          height="120"
          rx="8"
          fill="rgba(15, 23, 42, 0.8)"
          stroke="#1e293b"
          strokeWidth="1"
        />
        <text
          x="140"
          y="20"
          fill="#f1f5f9"
          fontSize="13"
          fontWeight="700"
          textAnchor="middle"
        >
          Lógica de Rebalanceo:
        </text>
        {[
          "• Leverage < Min → Aumentar exposición",
          "• Leverage en rango → Mantener",
          "• Leverage > Max → Solo colateral",
        ].map((text, idx) => (
          <text
            key={idx}
            x="20"
            y={45 + idx * 25}
            fill="#cbd5e1"
            fontSize="11"
          >
            {text}
          </text>
        ))}
      </g>
    </svg>
  );
}

