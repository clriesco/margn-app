import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";

import { EmailService } from "./email.service";
import { EmailNotificationType } from "./email.types";

/**
 * Public controller for email-related endpoints (no auth required)
 */
@Controller("email")
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * One-click unsubscribe endpoint
   * GET /api/email/unsubscribe?uid=xxx&type=xxx&sig=xxx
   */
  @Get("unsubscribe")
  async unsubscribe(
    @Query("uid") userId: string,
    @Query("type") notificationType: string,
    @Query("sig") signature: string,
    @Res() res: Response
  ): Promise<void> {
    // Validate params
    if (!userId || !notificationType || !signature) {
      res.status(400).send(this.renderUnsubscribePage(false, "Enlace invalido."));
      return;
    }

    // Verify signature
    const isValid = this.emailService.verifyUnsubscribeSignature(
      userId,
      notificationType,
      signature
    );

    if (!isValid) {
      res.status(403).send(this.renderUnsubscribePage(false, "Enlace invalido o expirado."));
      return;
    }

    // Process unsubscribe
    const success = await this.emailService.processUnsubscribe(
      userId,
      notificationType as EmailNotificationType
    );

    if (success) {
      const typeLabels: Record<string, string> = {
        contribution_reminder: "recordatorios de aportaciones",
        leverage_below_range: "alertas de leverage",
        leverage_above_range: "alertas de leverage",
        margin_ratio_alert: "alertas de leverage",
      };
      const label = typeLabels[notificationType] || "este tipo de notificacion";
      res.status(200).send(
        this.renderUnsubscribePage(true, `Has desactivado las notificaciones de ${label}. Puedes reactivarlas en tu perfil.`)
      );
    } else {
      res.status(400).send(this.renderUnsubscribePage(false, "No se pudo procesar la solicitud."));
    }
  }

  private renderUnsubscribePage(success: boolean, message: string): string {
    const frontendUrl = process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Margn - Notificaciones</title>
  <style>
    body { margin: 0; padding: 40px 16px; background: #f8f9fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px; text-align: center; }
    h1 { font-size: 24px; font-weight: 700; color: #1a1a2e; margin: 0 0 8px; }
    p { font-size: 15px; color: #6b7280; line-height: 24px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    a { color: #4c6ef5; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${success ? "&#9989;" : "&#10060;"}</div>
    <h1>${success ? "Listo" : "Error"}</h1>
    <p>${message}</p>
    <p style="margin-top: 24px;"><a href="${frontendUrl}/dashboard/profile">Ir a mi perfil</a></p>
  </div>
</body>
</html>`;
  }
}
