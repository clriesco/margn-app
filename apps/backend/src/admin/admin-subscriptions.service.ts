import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { SubscriptionTier, TIER_LIMITS } from "../billing/billing.constants";
import { PrismaService } from "../prisma/prisma.service";

import { AuditLogService } from "./audit-log.service";

@Injectable()
export class AdminSubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async findMany(params: {
    tier?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = params;
    const where: any = {};

    if (params.tier) where.tier = params.tier;
    if (params.status) where.status = params.status;

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        include: {
          user: { select: { email: true, fullName: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async overrideTier(
    adminId: string,
    userId: string,
    tier: string,
    ip?: string
  ) {
    if (!TIER_LIMITS[tier]) {
      throw new BadRequestException(`Invalid tier: ${tier}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const before = existing
      ? { tier: existing.tier, status: existing.status }
      : { tier: "none", status: "none" };

    const updated = await this.prisma.subscription.upsert({
      where: { userId },
      update: { tier, status: "active" },
      create: { userId, tier, status: "active" },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.override_tier",
      targetType: "subscription",
      targetId: updated.id,
      details: {
        before,
        after: { tier, status: "active" },
        email: user.email,
      },
      ipAddress: ip,
    });

    return updated;
  }

  async extendTrial(
    adminId: string,
    userId: string,
    days: number,
    ip?: string
  ) {
    if (days < 1 || days > 365) {
      throw new BadRequestException("Days must be between 1 and 365");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const existing = await this.prisma.subscription.findUnique({
      where: { userId },
    });

    const baseDate = existing?.trialEnd && existing.trialEnd > new Date()
      ? existing.trialEnd
      : new Date();
    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    const newTier = existing && existing.tier !== SubscriptionTier.STARTER
      ? existing.tier
      : SubscriptionTier.PRO;

    const updated = await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        trialEnd: newTrialEnd,
        status: "trialing",
        tier: newTier,
      },
      create: {
        userId,
        trialEnd: newTrialEnd,
        status: "trialing",
        tier: SubscriptionTier.PRO,
      },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.extend_trial",
      targetType: "subscription",
      targetId: updated.id,
      details: {
        days,
        previousTrialEnd: existing?.trialEnd ?? null,
        newTrialEnd,
        email: user.email,
      },
      ipAddress: ip,
    });

    return updated;
  }

  async grantComplimentary(
    adminId: string,
    userId: string,
    tier: string,
    expiresAt?: string,
    ip?: string
  ) {
    if (!TIER_LIMITS[tier]) {
      throw new BadRequestException(`Invalid tier: ${tier}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const updated = await this.prisma.subscription.upsert({
      where: { userId },
      update: {
        tier,
        status: "active",
        currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
      },
      create: {
        userId,
        tier,
        status: "active",
        currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.comp",
      targetType: "subscription",
      targetId: updated.id,
      details: { tier, expiresAt, email: user.email },
      ipAddress: ip,
    });

    return updated;
  }
}
