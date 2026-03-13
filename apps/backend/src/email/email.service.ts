import * as crypto from "crypto";

import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";

import { PrismaService } from "../prisma/prisma.service";

import {
  EmailNotificationType,
  SendEmailParams,
  NOTIFICATION_PREFERENCE_MAP,
  COOLDOWN_HOURS,
} from "./email.types";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend | null = null;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        "RESEND_API_KEY not set — email sending disabled (logging only)"
      );
    }
  }

  /**
   * Check if a user has opted in for this notification type
   */
  async shouldSendEmail(
    userId: string,
    notificationType: EmailNotificationType
  ): Promise<boolean> {
    const preferenceField = NOTIFICATION_PREFERENCE_MAP[notificationType];

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notifyOnContributions: true,
        notifyOnLeverageAlerts: true,
        notifyOnRebalance: true,
        notifyOnNotifications: true,
      },
    });

    if (!user) return false;
    return user[preferenceField] !== false;
  }

  /**
   * Check if an email was already sent within the cool-down period
   */
  async isDuplicate(
    deduplicationKey: string,
    notificationType: EmailNotificationType
  ): Promise<boolean> {
    const cooldownHours = COOLDOWN_HOURS[notificationType];
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

    const existing = await this.prisma.emailLog.findFirst({
      where: {
        deduplicationKey,
        sentAt: { gt: cutoff },
        status: { not: "failed" },
      },
    });

    return !!existing;
  }

  /**
   * Generate a deduplication key for a notification
   */
  getDeduplicationKey(
    notificationType: EmailNotificationType,
    portfolioId: string
  ): string {
    const today = new Date().toISOString().split("T")[0];
    return `${notificationType}:${portfolioId}:${today}`;
  }

  /**
   * Generate a signed unsubscribe URL
   */
  generateUnsubscribeUrl(
    userId: string,
    notificationType: EmailNotificationType
  ): string {
    const frontendUrl =
      process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";
    const secret = process.env.CRON_SECRET_TOKEN || "default-secret";
    const sig = crypto
      .createHmac("sha256", secret)
      .update(`${userId}:${notificationType}`)
      .digest("hex")
      .substring(0, 32);

    return `${frontendUrl}/api/email/unsubscribe?uid=${userId}&type=${notificationType}&sig=${sig}`;
  }

  /**
   * Get the preferences URL
   */
  getPreferencesUrl(): string {
    const frontendUrl =
      process.env.EMAIL_FRONTEND_URL || "https://app.margn.es";
    return `${frontendUrl}/dashboard/profile`;
  }

  /**
   * Verify an unsubscribe signature
   */
  verifyUnsubscribeSignature(
    userId: string,
    notificationType: string,
    signature: string
  ): boolean {
    const secret = process.env.CRON_SECRET_TOKEN || "default-secret";
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${userId}:${notificationType}`)
      .digest("hex")
      .substring(0, 32);

    return signature === expected;
  }

  /**
   * Process an unsubscribe request
   */
  async processUnsubscribe(
    userId: string,
    notificationType: EmailNotificationType
  ): Promise<boolean> {
    const preferenceField = NOTIFICATION_PREFERENCE_MAP[notificationType];
    if (!preferenceField) return false;

    await this.prisma.user.update({
      where: { id: userId },
      data: { [preferenceField]: false },
    });

    return true;
  }

  /**
   * Send a notification email with deduplication and preference checks
   */
  async sendNotificationEmail(params: SendEmailParams): Promise<boolean> {
    const {
      userId,
      email,
      portfolioId,
      portfolioName,
      notificationType,
      subject,
      html,
    } = params;

    const dedupKey = this.getDeduplicationKey(notificationType, portfolioId);

    // Check user preferences
    const shouldSend = await this.shouldSendEmail(userId, notificationType);
    if (!shouldSend) {
      this.logger.debug(
        `Skipping ${notificationType} for ${email} — user opted out`
      );
      return false;
    }

    // Check deduplication
    const isDup = await this.isDuplicate(dedupKey, notificationType);
    if (isDup) {
      this.logger.debug(
        `Skipping ${notificationType} for ${email} — already sent within cool-down`
      );
      return false;
    }

    // Send via Resend or log
    let resendId: string | null = null;
    let status = "sent";
    let errorMessage: string | null = null;

    if (this.resend) {
      try {
        const result = await this.resend.emails.send({
          from: "Margn <notifications@margn.es>",
          to: email,
          subject,
          html,
          headers: {
            "List-Unsubscribe": `<${this.generateUnsubscribeUrl(userId, notificationType)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });

        if (result.error) {
          status = "failed";
          errorMessage = result.error.message;
          this.logger.error(
            `Failed to send ${notificationType} to ${email}: ${result.error.message}`
          );
        } else {
          resendId = result.data?.id || null;
          this.logger.log(
            `Sent ${notificationType} to ${email} (${portfolioName}) — id: ${resendId}`
          );
        }
      } catch (err) {
        status = "failed";
        errorMessage = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Error sending ${notificationType} to ${email}: ${errorMessage}`
        );
      }
    } else {
      this.logger.log(
        `[DRY RUN] Would send ${notificationType} to ${email} (${portfolioName}): ${subject}`
      );
    }

    // Log to database
    await this.prisma.emailLog.create({
      data: {
        userId,
        portfolioId,
        notificationType,
        subject,
        recipientEmail: email,
        resendId,
        status,
        errorMessage,
        deduplicationKey: dedupKey,
      },
    });

    return status === "sent";
  }
}
