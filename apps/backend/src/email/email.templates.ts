/**
 * Email templates for Margn notifications
 *
 * Uses plain HTML with inline styles for maximum email client compatibility.
 * No React Email dependency — keeps things simple and avoids JSX in the backend build.
 */

import {
  ContributionReminderData,
  LeverageAlertData,
  MarginAlertData,
} from "./email.types";

// ============================================
// DESIGN TOKENS
// ============================================

const colors = {
  background: "#f8f9fa",
  cardBg: "#ffffff",
  text: "#1a1a2e",
  textMuted: "#6b7280",
  primary: "#4c6ef5",
  primaryDark: "#3b5de7",
  danger: "#ef4444",
  warning: "#f59e0b",
  info: "#3b82f6",
  border: "#e5e7eb",
};

// ============================================
// BASE LAYOUT
// ============================================

function baseLayout(content: string, unsubscribeUrl: string, preferencesUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margn</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${colors.background}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${colors.background};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom: 24px;">
              <span style="font-size: 24px; font-weight: 700; color: ${colors.text}; letter-spacing: -0.025em;">margn</span>
            </td>
          </tr>

          <!-- Content Card -->
          <tr>
            <td style="background-color: ${colors.cardBg}; border-radius: 8px; border: 1px solid ${colors.border}; padding: 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 24px; text-align: center;">
              <p style="font-size: 12px; color: ${colors.textMuted}; line-height: 20px; margin: 0 0 8px 0;">
                Margn es una herramienta de calculo y visualizacion. Las metricas y valores calculados son informativos y no constituyen asesoramiento financiero. Toda decision de inversion es responsabilidad exclusiva del usuario.
              </p>
              <p style="font-size: 12px; color: ${colors.textMuted}; margin: 0;">
                <a href="${unsubscribeUrl}" style="color: ${colors.textMuted}; text-decoration: underline;">Desactivar este tipo de notificacion</a>
                &nbsp;&middot;&nbsp;
                <a href="${preferencesUrl}" style="color: ${colors.textMuted}; text-decoration: underline;">Gestionar preferencias</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================
// REUSABLE COMPONENTS
// ============================================

function metricRow(label: string, value: string): string {
  return `<tr>
    <td style="padding: 8px 0; color: ${colors.textMuted}; font-size: 14px; border-bottom: 1px solid ${colors.border};">${label}</td>
    <td style="padding: 8px 0; color: ${colors.text}; font-size: 14px; font-weight: 600; text-align: right; border-bottom: 1px solid ${colors.border};">${value}</td>
  </tr>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
    <tr>
      <td align="center">
        <a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: ${colors.primary}; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; border-radius: 6px; min-width: 200px; text-align: center;">${text}</a>
      </td>
    </tr>
  </table>`;
}

function statusBadge(text: string, color: string): string {
  return `<span style="display: inline-block; padding: 4px 12px; background-color: ${color}20; color: ${color}; font-size: 12px; font-weight: 600; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${text}</span>`;
}

// ============================================
// FORMAT HELPERS
// ============================================

function formatCurrency(amount: number): string {
  return "$" + amount.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatLeverage(leverage: number): string {
  return leverage.toFixed(2).replace(".", ",") + "x";
}

function formatPercent(ratio: number): string {
  return (ratio * 100).toFixed(1).replace(".", ",") + "%";
}

// ============================================
// TEMPLATES
// ============================================

export function renderContributionReminder(
  data: ContributionReminderData,
  unsubscribeUrl: string,
  preferencesUrl: string,
): string {
  const content = `
    <h1 style="font-size: 20px; font-weight: 700; color: ${colors.text}; margin: 0 0 4px 0;">Día de aportación</h1>
    <p style="font-size: 14px; color: ${colors.textMuted}; margin: 0 0 24px 0;">${data.portfolioName}</p>

    <p style="font-size: 15px; color: ${colors.text}; line-height: 24px; margin: 0 0 20px 0;">
      Hoy toca. Es el día de aportación que definiste para mantener tu estrategia DCA en marcha. El monto configurado es de <strong>${formatCurrency(data.configuredAmount)}</strong>.
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Equity actual", formatCurrency(data.currentEquity))}
      ${metricRow("Apalancamiento actual", formatLeverage(data.currentLeverage))}
    </table>

    ${ctaButton("Registrar aportación", data.contributionUrl)}
  `;

  return baseLayout(content, unsubscribeUrl, preferencesUrl);
}

export function renderLeverageAlert(
  data: LeverageAlertData,
  unsubscribeUrl: string,
  preferencesUrl: string,
): string {
  const isAbove = data.direction === "above";
  const badgeColor = isAbove ? colors.danger : colors.warning;
  const badgeLabel = isAbove ? "Apalancamiento alto" : "Apalancamiento bajo";
  const limit = isAbove ? data.leverageMax : data.leverageMin;

  let actionText: string;
  if (isAbove && data.extraContributionAmount) {
    actionText = `Un aporte de <strong>${formatCurrency(data.extraContributionAmount)}</strong> lo devolvería a tu máximo de ${formatLeverage(data.leverageMax)}. Cuanto más tiempo permanezca por encima, mayor es el riesgo si el mercado se mueve en contra.`;
  } else if (!isAbove) {
    actionText = `Tu apalancamiento ha bajado por debajo del mínimo que definiste. Esto significa que tu capital no está trabajando al nivel que planificaste.`;
  } else {
    actionText = `Tu apalancamiento ha superado el máximo de ${formatLeverage(data.leverageMax)} que definiste. Esto incrementa tu exposición al riesgo.`;
  }

  const ctaText = isAbove ? "Añadir aportación extra" : "Ver ajustes recomendados";

  const content = `
    ${statusBadge(badgeLabel, badgeColor)}
    <h1 style="font-size: 20px; font-weight: 700; color: ${colors.text}; margin: 16px 0 4px 0;">Apalancamiento ${formatLeverage(data.currentLeverage)}</h1>
    <p style="font-size: 14px; color: ${colors.textMuted}; margin: 0 0 24px 0;">${data.portfolioName}</p>

    <p style="font-size: 15px; color: ${colors.text}; line-height: 24px; margin: 0 0 20px 0;">
      ${actionText}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Apalancamiento actual", formatLeverage(data.currentLeverage))}
      ${metricRow(isAbove ? "Tu máximo" : "Tu mínimo", formatLeverage(limit))}
      ${isAbove && data.extraContributionAmount ? metricRow("Aporte para corregir", formatCurrency(data.extraContributionAmount)) : ""}
    </table>

    ${ctaButton(ctaText, data.actionUrl)}
  `;

  return baseLayout(content, unsubscribeUrl, preferencesUrl);
}

export function renderMarginAlert(
  data: MarginAlertData,
  unsubscribeUrl: string,
  preferencesUrl: string,
): string {
  const isCritical = data.level === "critical";
  const badgeColor = isCritical ? colors.danger : colors.warning;
  const badgeText = isCritical ? "Margen crítico" : "Margen bajo";
  const description = isCritical
    ? `Tu margen está en zona de riesgo. Si el mercado se mueve en contra, el broker podría liquidar tus posiciones. <strong>Actúa ahora:</strong> aporta capital o reduce exposición.`
    : `Tu colchón de margen se está reduciendo. Todavía tienes margen de maniobra, pero es buen momento para revisar tu exposición y valorar ajustes antes de que la situación se tense.`;

  const content = `
    ${statusBadge(badgeText, badgeColor)}
    <h1 style="font-size: 20px; font-weight: 700; color: ${colors.text}; margin: 16px 0 4px 0;">Ratio de margen ${formatPercent(data.marginRatio)}</h1>
    <p style="font-size: 14px; color: ${colors.textMuted}; margin: 0 0 24px 0;">${data.portfolioName}</p>

    <p style="font-size: 15px; color: ${colors.text}; line-height: 24px; margin: 0 0 20px 0;">
      ${description}
    </p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      ${metricRow("Ratio de margen", formatPercent(data.marginRatio))}
      ${metricRow("Equity", formatCurrency(data.currentEquity))}
      ${metricRow("Exposición", formatCurrency(data.currentExposure))}
    </table>

    ${ctaButton(isCritical ? "Actuar ahora" : "Revisar portfolio", data.dashboardUrl)}
  `;

  return baseLayout(content, unsubscribeUrl, preferencesUrl);
}
