import React from "react";
import Head from "next/head";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function Terms() {
  return (
    <>
      <Head>
        <title>Términos y Condiciones — Leveraged DCA</title>
      </Head>
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg-body)",
          padding: "2rem 1rem",
        }}
      >
        <article
          style={{
            maxWidth: "800px",
            margin: "0 auto",
            color: "var(--text-primary)",
          }}
        >
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              color: "var(--text-muted)",
              textDecoration: "none",
              fontSize: "0.9rem",
              marginBottom: "2rem",
            }}
          >
            <ArrowLeft size={16} />
            Volver al inicio
          </Link>

          <h1
            style={{
              fontSize: "2rem",
              fontWeight: "700",
              marginBottom: "0.25rem",
            }}
          >
            Términos y Condiciones
          </h1>
          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              marginBottom: "2.5rem",
            }}
          >
            Última actualización: 7 de febrero de 2025
          </p>

          <Section title="1. Aceptación de los términos">
            <p>
              Al acceder y utilizar Leveraged DCA (&quot;la Aplicación&quot;),
              aceptas quedar vinculado por estos Términos y Condiciones. Si no
              estás de acuerdo con alguna parte de estos términos, no debes
              utilizar la Aplicación.
            </p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>
              Leveraged DCA es una herramienta de gestión de portfolios diseñada
              para implementar una estrategia de Dollar Cost Averaging (DCA)
              condicional con apalancamiento dinámico. La Aplicación permite:
            </p>
            <ul>
              <li>Crear y gestionar portfolios de inversión apalancados.</li>
              <li>
                Registrar contribuciones y posiciones de forma manual.
              </li>
              <li>
                Recibir propuestas de rebalanceo basadas en optimización
                cuantitativa (maximización del ratio Sharpe).
              </li>
              <li>
                Monitorizar métricas de rendimiento, apalancamiento y riesgo.
              </li>
            </ul>
            <p>
              La Aplicación <strong>no ejecuta operaciones</strong> en ningún
              broker ni mercado financiero. Todas las operaciones de compra y
              venta deben ser realizadas por el usuario de forma independiente en
              su plataforma de trading.
            </p>
          </Section>

          <Section title="3. Disclaimer financiero">
            <p>
              <strong>
                La Aplicación no constituye asesoramiento financiero, fiscal ni
                de inversión.
              </strong>{" "}
              Leveraged DCA no es un broker, asesor financiero registrado, ni
              entidad regulada por ningún organismo financiero.
            </p>
            <p>
              Las propuestas de rebalanceo, señales de despliegue y
              recomendaciones generadas por la Aplicación son de carácter
              puramente informativo y se basan en modelos cuantitativos que
              pueden contener errores o no ser apropiados para tu situación
              financiera particular.
            </p>
            <p>
              <strong>
                Todas las decisiones de inversión son responsabilidad exclusiva
                del usuario.
              </strong>
            </p>
          </Section>

          <Section title="4. Riesgos del apalancamiento">
            <p>
              El uso de apalancamiento amplifica tanto las ganancias como las
              pérdidas. Debes ser consciente de los siguientes riesgos:
            </p>
            <ul>
              <li>
                <strong>Pérdidas amplificadas:</strong> con un apalancamiento de
                3x, una caída del 10% en el valor de los activos representa una
                pérdida del 30% sobre tu capital propio.
              </li>
              <li>
                <strong>Margin call:</strong> si el apalancamiento supera
                ciertos umbrales, el broker puede liquidar tus posiciones de
                forma forzosa, resultando en la pérdida total o parcial de tu
                capital.
              </li>
              <li>
                <strong>Costes de financiación:</strong> mantener posiciones
                apalancadas genera intereses que reducen la rentabilidad real.
                Estos costes no están modelados en la Aplicación.
              </li>
              <li>
                <strong>Rendimientos pasados no garantizan resultados futuros.</strong>{" "}
                Los backtests y simulaciones se basan en datos históricos que
                pueden no repetirse.
              </li>
            </ul>
            <p>
              Solo debes invertir capital que puedas permitirte perder en su
              totalidad.
            </p>
          </Section>

          <Section title="5. Responsabilidades del usuario">
            <p>Al utilizar la Aplicación, te comprometes a:</p>
            <ul>
              <li>
                Introducir datos precisos y actualizados sobre tus posiciones y
                contribuciones.
              </li>
              <li>
                Gestionar tu propio riesgo y no depender exclusivamente de las
                señales de la Aplicación.
              </li>
              <li>
                Cumplir con la legislación fiscal y financiera aplicable en tu
                jurisdicción.
              </li>
              <li>
                No utilizar la Aplicación para actividades ilegales o no
                autorizadas.
              </li>
              <li>
                Mantener la seguridad de tu cuenta y credenciales de acceso.
              </li>
            </ul>
          </Section>

          <Section title="6. Datos y privacidad">
            <p>La Aplicación recopila y almacena los siguientes datos:</p>
            <ul>
              <li>
                <strong>Datos de cuenta:</strong> dirección de email utilizada
                para la autenticación.
              </li>
              <li>
                <strong>Datos de portfolio:</strong> posiciones, contribuciones,
                configuración de estrategia y métricas calculadas.
              </li>
              <li>
                <strong>Datos de mercado:</strong> precios históricos obtenidos
                de fuentes públicas (Yahoo Finance).
              </li>
            </ul>
            <p>
              Los datos se almacenan en servidores seguros proporcionados por
              Supabase y Render. <strong>No compartimos tus datos personales ni
              financieros con terceros</strong>, salvo requerimiento legal.
            </p>
            <p>
              Puedes solicitar la eliminación de tu cuenta y todos los datos
              asociados contactándonos por email.
            </p>
          </Section>

          <Section title="7. Propiedad intelectual">
            <p>
              El código fuente, diseño, contenido y algoritmos de la Aplicación
              son propiedad de Leveraged DCA. Queda prohibida la reproducción,
              distribución o modificación no autorizada de cualquier parte de la
              Aplicación.
            </p>
          </Section>

          <Section title="8. Limitación de responsabilidad">
            <p>
              En la máxima medida permitida por la ley, Leveraged DCA{" "}
              <strong>no será responsable</strong> por:
            </p>
            <ul>
              <li>
                Pérdidas financieras derivadas de decisiones de inversión
                tomadas con base en la información proporcionada por la
                Aplicación.
              </li>
              <li>
                Interrupciones del servicio, errores en el cálculo de métricas o
                retrasos en la actualización de datos.
              </li>
              <li>
                Inexactitudes en los precios de mercado obtenidos de fuentes
                externas.
              </li>
              <li>
                Acceso no autorizado a tu cuenta debido a negligencia en la
                custodia de tus credenciales.
              </li>
              <li>
                Daños indirectos, incidentales o consecuentes de cualquier tipo.
              </li>
            </ul>
          </Section>

          <Section title="9. Disponibilidad del servicio">
            <p>
              La Aplicación se proporciona &quot;tal cual&quot; (as is) y
              &quot;según disponibilidad&quot; (as available). No garantizamos
              un funcionamiento ininterrumpido ni libre de errores. Nos
              reservamos el derecho de modificar, suspender o discontinuar el
              servicio en cualquier momento sin previo aviso.
            </p>
          </Section>

          <Section title="10. Modificaciones de los términos">
            <p>
              Nos reservamos el derecho de actualizar estos Términos y
              Condiciones en cualquier momento. La fecha de última actualización
              se indicará al inicio de este documento. El uso continuado de la
              Aplicación tras la publicación de cambios constituye la aceptación
              de los nuevos términos.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>
              Para cualquier consulta sobre estos términos, puedes contactarnos
              en:{" "}
              <a
                href="mailto:contact@leverageddca.com"
                style={{ color: "#3b82f6" }}
              >
                contact@leverageddca.com
              </a>
            </p>
          </Section>

          <div
            style={{
              marginTop: "3rem",
              paddingTop: "1.5rem",
              borderTop: "1px solid var(--border-color, #333)",
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              textAlign: "center",
            }}
          >
            © {new Date().getFullYear()} Leveraged DCA. Todos los derechos
            reservados.
          </div>
        </article>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: "2rem" }}>
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: "600",
          marginBottom: "0.75rem",
          color: "var(--text-primary)",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          color: "var(--text-secondary, var(--text-muted))",
          fontSize: "0.95rem",
          lineHeight: "1.7",
        }}
      >
        {children}
      </div>
      <style jsx>{`
        div :global(p) {
          margin: 0 0 0.75rem;
        }
        div :global(p:last-child) {
          margin-bottom: 0;
        }
        div :global(ul) {
          margin: 0.5rem 0 0.75rem;
          padding-left: 1.5rem;
        }
        div :global(li) {
          margin-bottom: 0.4rem;
        }
      `}</style>
    </section>
  );
}
