#!/usr/bin/env ts-node

/**
 * Daily portfolio check job (CLI wrapper)
 * Verifies leverage status, generates notifications, and checks contribution days.
 * The check itself lives in apps/backend/src/cron/jobs so the backend scheduler
 * runs it compiled; this wrapper runs it standalone and sends the email
 * notifications.
 *
 * Run manually: npx ts-node daily-check.ts
 * Or via cron: 0 8 * * * cd /path/to/scripts && npx ts-node daily-check.ts
 */

import { PrismaClient } from "@prisma/client";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as path from "path";

import {
  DailyCheckResult,
  PortfolioState,
  StatusNotification,
  runDailyCheck as runDailyCheckJob,
} from "../../apps/backend/src/cron/jobs/daily-check.job";

// Load .env from backend directory (only in development)
if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.join(process.cwd(), "apps/backend/.env") });
}

/**
 * Main daily check function
 */
async function runDailyCheck(): Promise<DailyCheckResult> {
  const prisma = new PrismaClient();
  try {
    return await runDailyCheckJob(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// ============================================
// EMAIL NOTIFICATIONS
// ============================================

// Inline Resend import — avoids coupling infra scripts to the NestJS app module
let Resend: any;
try {
  Resend = require("resend").Resend;
} catch {
  // resend not installed in this environment
}

/**
 * Notification type to user preference field mapping
 */
const NOTIFICATION_PREFERENCE_MAP: Record<string, string> = {
  contribution_reminder: "notify_on_contributions",
  leverage_below_range: "notify_on_leverage_alerts",
  leverage_above_range: "notify_on_leverage_alerts",
  margin_ratio_alert: "notify_on_leverage_alerts",
};

/**
 * Cool-down periods in hours
 */
const COOLDOWN_HOURS: Record<string, number> = {
  contribution_reminder: 24,
  leverage_below_range: 48,
  leverage_above_range: 48,
  margin_ratio_alert: 24,
};

/**
 * Generate signed unsubscribe URL
 */
function generateUnsubscribeUrl(userId: string, notificationType: string): string {
  const frontendUrl = process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";
  const secret = process.env.CRON_SECRET_TOKEN || "default-secret";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${notificationType}`)
    .digest("hex")
    .substring(0, 32);
  return `${frontendUrl}/api/email/unsubscribe?uid=${userId}&type=${notificationType}&sig=${sig}`;
}

/**
 * Format helpers for email templates
 */
function fmtCurrency(amount: number): string {
  return "$" + Math.round(amount).toLocaleString("es-ES");
}
function fmtLeverage(leverage: number): string {
  return leverage.toFixed(2).replace(".", ",") + "x";
}
function fmtPercent(ratio: number): string {
  return (ratio * 100).toFixed(1).replace(".", ",") + "%";
}

/**
 * Email base layout
 */
function emailLayout(content: string, unsubscribeUrl: string, preferencesUrl: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Margn</title></head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="padding-bottom:24px;"><span style="font-size:24px;font-weight:700;color:#1a1a2e;letter-spacing:-0.025em;">margn</span></td></tr>
<tr><td style="background-color:#ffffff;border-radius:8px;border:1px solid #e5e7eb;padding:32px;">${content}</td></tr>
<tr><td style="padding-top:24px;text-align:center;">
<p style="font-size:12px;color:#6b7280;line-height:20px;margin:0 0 8px;">Margn es una herramienta de calculo y visualizacion. Las metricas son informativas y no constituyen asesoramiento financiero.</p>
<p style="font-size:12px;color:#6b7280;margin:0;">
<a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Desactivar este tipo de notificacion</a> &middot;
<a href="${preferencesUrl}" style="color:#6b7280;text-decoration:underline;">Gestionar preferencias</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function metricRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:8px 0;color:#1a1a2e;font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid #e5e7eb;">${value}</td></tr>`;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td align="center"><a href="${url}" style="display:inline-block;padding:14px 32px;background-color:#4c6ef5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;min-width:200px;text-align:center;">${text}</a></td></tr></table>`;
}

function statusBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;background-color:${color}20;color:${color};font-size:12px;font-weight:600;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">${text}</span>`;
}

/**
 * Build email HTML for a notification
 */
function buildEmailHtml(
  state: PortfolioState,
  notification: StatusNotification,
  unsubscribeUrl: string,
  preferencesUrl: string
): { subject: string; html: string } {
  const frontendUrl = process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";

  switch (notification.type) {
    case "contribution_reminder": {
      const subject = "Hoy es tu día de aportación";
      const content = `
        <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:0 0 4px;">Día de aportación</h1>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">${state.portfolioName}</p>
        <p style="font-size:15px;color:#1a1a2e;line-height:24px;margin:0 0 20px;">Hoy toca. Es el día de aportación que definiste para mantener tu estrategia DCA en marcha.${state.monthlyContribution ? ` El monto configurado es de <strong>${fmtCurrency(state.monthlyContribution)}</strong>.` : ""}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${metricRow("Equity actual", fmtCurrency(state.equity))}
          ${metricRow("Apalancamiento actual", fmtLeverage(state.leverage))}
          ${state.monthlyContribution ? metricRow("Aportación configurada", fmtCurrency(state.monthlyContribution)) : ""}
        </table>
        ${ctaButton("Registrar aportación", `${frontendUrl}/dashboard/contribution`)}`;
      return { subject, html: emailLayout(content, unsubscribeUrl, preferencesUrl) };
    }

    case "leverage_above_range": {
      const extraMatch = notification.message.match(/~\$([0-9.,]+)/);
      const extraAmount = extraMatch ? extraMatch[1] : null;
      const subject = "Tu apalancamiento ha subido por encima de tu rango";
      const actionText = extraAmount
        ? `Un aporte de <strong>$${extraAmount}</strong> lo devolvería a tu máximo de ${fmtLeverage(state.leverageMax)}. Cuanto más tiempo permanezca por encima, mayor es el riesgo si el mercado se mueve en contra.`
        : `Tu apalancamiento ha superado el máximo de ${fmtLeverage(state.leverageMax)} que definiste. Esto incrementa tu exposición al riesgo.`;
      const actionUrl = extraAmount
        ? `${frontendUrl}/dashboard/contribution?extra=true&amount=${extraAmount.replace(/\./g, "")}`
        : `${frontendUrl}/dashboard/contribution`;

      const content = `
        ${statusBadge("Apalancamiento alto", "#ef4444")}
        <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:16px 0 4px;">Apalancamiento ${fmtLeverage(state.leverage)}</h1>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">${state.portfolioName}</p>
        <p style="font-size:15px;color:#1a1a2e;line-height:24px;margin:0 0 20px;">${actionText}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${metricRow("Apalancamiento actual", fmtLeverage(state.leverage))}
          ${metricRow("Tu máximo", fmtLeverage(state.leverageMax))}
          ${extraAmount ? metricRow("Aporte para corregir", `$${extraAmount}`) : ""}
        </table>
        ${ctaButton("Añadir aportación extra", actionUrl)}`;
      return { subject, html: emailLayout(content, unsubscribeUrl, preferencesUrl) };
    }

    case "leverage_below_range": {
      const subject = "Tu apalancamiento ha bajado por debajo de tu rango";
      const content = `
        ${statusBadge("Apalancamiento bajo", "#f59e0b")}
        <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:16px 0 4px;">Apalancamiento ${fmtLeverage(state.leverage)}</h1>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">${state.portfolioName}</p>
        <p style="font-size:15px;color:#1a1a2e;line-height:24px;margin:0 0 20px;">Tu apalancamiento ha bajado por debajo del mínimo que definiste. Esto significa que tu capital no está trabajando al nivel que planificaste.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${metricRow("Apalancamiento actual", fmtLeverage(state.leverage))}
          ${metricRow("Tu mínimo", fmtLeverage(state.leverageMin))}
        </table>
        ${ctaButton("Ver ajustes recomendados", `${frontendUrl}/dashboard/rebalance`)}`;
      return { subject, html: emailLayout(content, unsubscribeUrl, preferencesUrl) };
    }

    case "margin_ratio_alert": {
      const isCritical = notification.level === "attention";
      const subject = isCritical
        ? "Tu margen está en zona crítica — revisa tu portfolio ahora"
        : "Tu ratio de margen necesita atención";
      const badgeText = isCritical ? "Margen crítico" : "Margen bajo";
      const badgeColor = isCritical ? "#ef4444" : "#f59e0b";
      const description = isCritical
        ? `Tu margen está en zona de riesgo. Si el mercado se mueve en contra, el broker podría liquidar tus posiciones. <strong>Actúa ahora:</strong> aporta capital o reduce exposición.`
        : `Tu colchón de margen se está reduciendo. Todavía tienes margen de maniobra, pero es buen momento para revisar tu exposición y valorar ajustes antes de que la situación se tense.`;
      const content = `
        ${statusBadge(badgeText, badgeColor)}
        <h1 style="font-size:20px;font-weight:700;color:#1a1a2e;margin:16px 0 4px;">Ratio de margen ${fmtPercent(state.marginRatio)}</h1>
        <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">${state.portfolioName}</p>
        <p style="font-size:15px;color:#1a1a2e;line-height:24px;margin:0 0 20px;">${description}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${metricRow("Ratio de margen", fmtPercent(state.marginRatio))}
          ${metricRow("Equity", fmtCurrency(state.equity))}
          ${metricRow("Exposición", fmtCurrency(state.exposure))}
        </table>
        ${ctaButton(isCritical ? "Actuar ahora" : "Revisar portfolio", `${frontendUrl}/dashboard`)}`;
      return { subject, html: emailLayout(content, unsubscribeUrl, preferencesUrl) };
    }
  }
}

/**
 * Max emails per user per day
 */
const DAILY_EMAIL_CAP = 2;

/**
 * Max consecutive sends of the same notification type before back-off.
 * After this many sends, the notification is suppressed until the condition resolves.
 */
const PROGRESSIVE_BACKOFF_LIMIT = 3;

/**
 * Check how many times this notification type has been sent consecutively
 * for this portfolio (without a gap where the condition resolved).
 */
async function getConsecutiveSendCount(
  prisma: PrismaClient,
  portfolioId: string,
  notificationType: string
): Promise<number> {
  // Count recent sends of this type in the last 14 days
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentSends = await prisma.emailLog.count({
    where: {
      portfolioId,
      notificationType,
      status: { not: "failed" },
      sentAt: { gt: cutoff },
    },
  });
  return recentSends;
}

/**
 * Count emails sent to a user today
 */
async function getTodayEmailCount(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return prisma.emailLog.count({
    where: {
      userId,
      status: { not: "failed" },
      sentAt: { gte: todayStart },
    },
  });
}

/**
 * Filter notifications: if margin_ratio_alert is present, suppress leverage alerts
 */
function filterOverlappingNotifications(
  notifications: StatusNotification[]
): StatusNotification[] {
  const hasMarginAlert = notifications.some((n) => n.type === "margin_ratio_alert");
  if (!hasMarginAlert) return notifications;

  return notifications.filter(
    (n) => n.type !== "leverage_above_range" && n.type !== "leverage_below_range"
  );
}

/**
 * Send email notifications via Resend
 */
async function sendNotifications(
  prisma: PrismaClient,
  result: DailyCheckResult
): Promise<void> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const resend = resendApiKey && Resend ? new Resend(resendApiKey) : null;
  const frontendUrl = process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";
  const preferencesUrl = `${frontendUrl}/dashboard/profile`;
  const today = new Date().toISOString().split("T")[0];

  // Track emails sent per user in this run (for daily cap)
  const emailsSentPerUser: Record<string, number> = {};

  // Collect all notifications to send
  const emailsToSend: Array<{
    state: PortfolioState;
    notification: StatusNotification;
    userId: string;
  }> = [];

  for (const state of result.portfolioStates) {
    if (state.notifications.length === 0) continue;

    // Get user ID and preferences
    const user = await prisma.user.findUnique({
      where: { email: state.userEmail },
      select: {
        id: true,
        notifyOnContributions: true,
        notifyOnLeverageAlerts: true,
        notifyOnNotifications: true,
        notifyOnRebalance: true,
      },
    });
    if (!user) continue;

    // Filter overlapping notifications: margin alert suppresses leverage alerts
    const filtered = filterOverlappingNotifications(state.notifications);

    for (const notification of filtered) {
      // Check user preference
      const prefField = NOTIFICATION_PREFERENCE_MAP[notification.type];
      if (prefField) {
        const prefValue = (user as any)[prefField.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())];
        if (prefValue === false) {
          console.log(`   ⏭️  Skipping ${notification.type} for ${state.userEmail} — opted out`);
          continue;
        }
      }

      // Check deduplication (same-day / cool-down)
      const dedupKey = `${notification.type}:${state.portfolioId}:${today}`;
      const cooldownHours = COOLDOWN_HOURS[notification.type] || 24;
      const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

      const existing = await prisma.emailLog.findFirst({
        where: {
          deduplicationKey: dedupKey,
          sentAt: { gt: cutoff },
          status: { not: "failed" },
        },
      });

      if (existing) {
        console.log(`   ⏭️  Skipping ${notification.type} for ${state.userEmail} — already sent within cool-down`);
        continue;
      }

      // Progressive back-off: stop after N consecutive sends of the same type
      const consecutiveSends = await getConsecutiveSendCount(
        prisma,
        state.portfolioId,
        notification.type
      );
      if (consecutiveSends >= PROGRESSIVE_BACKOFF_LIMIT) {
        console.log(`   ⏭️  Skipping ${notification.type} for ${state.userEmail} — back-off after ${consecutiveSends} consecutive sends`);
        continue;
      }

      emailsToSend.push({ state, notification, userId: user.id });
    }
  }

  if (emailsToSend.length === 0) {
    console.log("\n📧 No email notifications to send.");
    return;
  }

  console.log(`\n📧 Sending ${emailsToSend.length} email notification(s)...`);

  let sent = 0;
  let failed = 0;
  let capped = 0;

  for (const { state, notification, userId } of emailsToSend) {
    // Daily cap: check total emails sent to this user today (DB + this run)
    const dbTodayCount = await getTodayEmailCount(prisma, userId);
    const runCount = emailsSentPerUser[userId] || 0;
    if (dbTodayCount + runCount >= DAILY_EMAIL_CAP) {
      console.log(`   ⏭️  Skipping ${notification.type} for ${state.userEmail} — daily cap reached (${DAILY_EMAIL_CAP})`);
      capped++;
      continue;
    }

    const unsubscribeUrl = generateUnsubscribeUrl(userId, notification.type);
    const { subject, html } = buildEmailHtml(state, notification, unsubscribeUrl, preferencesUrl);
    const dedupKey = `${notification.type}:${state.portfolioId}:${today}`;

    let resendId: string | null = null;
    let status = "sent";
    let errorMessage: string | null = null;

    if (resend) {
      try {
        const result = await resend.emails.send({
          from: "Margn <notifications@margn.es>",
          to: state.userEmail,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        if (result.error) {
          status = "failed";
          errorMessage = result.error.message;
          failed++;
        } else {
          resendId = result.data?.id || null;
          sent++;
          emailsSentPerUser[userId] = runCount + 1;
        }
      } catch (err) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
        failed++;
      }
    } else {
      console.log(`   [DRY RUN] ${notification.type} → ${state.userEmail}: ${subject}`);
      sent++;
      emailsSentPerUser[userId] = runCount + 1;
    }

    // Log to database
    await prisma.emailLog.create({
      data: {
        userId,
        portfolioId: state.portfolioId,
        notificationType: notification.type,
        subject,
        recipientEmail: state.userEmail,
        resendId,
        status,
        errorMessage,
        deduplicationKey: dedupKey,
      },
    });

    const icon = status === "sent" ? "✉️" : "❌";
    console.log(`   ${icon} ${state.userEmail}: [${notification.level.toUpperCase()}] ${notification.type}${errorMessage ? ` — ${errorMessage}` : ""}`);

    // Rate limit: 200ms between sends
    if (resend) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log(`   📊 Result: ${sent} sent, ${failed} failed${capped > 0 ? `, ${capped} capped` : ""}`);
}

// ============================================
// MAIN
// ============================================

// Run if called directly (CommonJS only)
if (typeof require !== "undefined" && require.main === module) {
  const prisma = new PrismaClient();
  runDailyCheckJob(prisma)
    .then(async (result) => {
      await sendNotifications(prisma, result);
      await prisma.$disconnect();
      console.log("\n✅ Daily check completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Daily check failed:", error);
      process.exit(1);
    });
}

export { runDailyCheck };
export type { DailyCheckResult, PortfolioState, StatusNotification };
