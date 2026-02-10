import {
  Controller,
  Post,
  Req,
  Res,
  HttpCode,
  BadRequestException,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Webhook } from "svix";

import { PrismaService } from "../prisma/prisma.service";

interface ClerkWebhookEvent {
  type: string;
  data: {
    id: string;
    email_addresses?: Array<{
      email_address: string;
      id: string;
    }>;
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
  };
}

/**
 * Webhook controller for Clerk user events
 * No AuthGuard — requests come from Clerk, verified via Svix signature
 */
@Controller("webhooks")
export class ClerkWebhookController {
  constructor(private prisma: PrismaService) {}

  @Post("clerk")
  @HttpCode(200)
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new BadRequestException("Webhook secret not configured");
    }

    const svixId = req.headers["svix-id"] as string;
    const svixTimestamp = req.headers["svix-timestamp"] as string;
    const svixSignature = req.headers["svix-signature"] as string;

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException("Missing Svix headers");
    }

    const wh = new Webhook(webhookSecret);
    let event: ClerkWebhookEvent;

    try {
      const body = (req as any).rawBody
        ? (req as any).rawBody.toString("utf8")
        : JSON.stringify(req.body);

      event = wh.verify(body, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      console.error("[ClerkWebhook] Signature verification failed:", err);
      throw new BadRequestException("Invalid webhook signature");
    }

    const { type, data } = event;

    const primaryEmail = data.email_addresses?.find(
      (e) => e.id === data.primary_email_address_id
    )?.email_address;

    if (type === "user.created" && primaryEmail) {
      const fullName = [data.first_name, data.last_name]
        .filter(Boolean)
        .join(" ") || null;

      await this.prisma.user.upsert({
        where: { email: primaryEmail },
        update: { clerkId: data.id, fullName: fullName || undefined },
        create: { email: primaryEmail, clerkId: data.id, fullName },
      });

      console.log(
        `[ClerkWebhook] user.created: ${primaryEmail} → ${data.id}`
      );
    }

    if (type === "user.updated" && primaryEmail) {
      const fullName = [data.first_name, data.last_name]
        .filter(Boolean)
        .join(" ") || null;

      const existing = await this.prisma.user.findUnique({
        where: { clerkId: data.id },
      });

      if (existing) {
        await this.prisma.user.update({
          where: { clerkId: data.id },
          data: {
            email: primaryEmail,
            ...(fullName ? { fullName } : {}),
          },
        });
        console.log(
          `[ClerkWebhook] user.updated: ${primaryEmail} → ${data.id}`
        );
      }
    }

    return res.json({ received: true });
  }
}
