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

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!sub) throw new NotFoundException("Subscription not found for user");

    const before = { tier: sub.tier, status: sub.status };

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: { tier, status: "active" },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.override_tier",
      targetType: "subscription",
      targetId: sub.id,
      details: {
        before,
        after: { tier, status: "active" },
        email: sub.user.email,
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

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!sub) throw new NotFoundException("Subscription not found for user");

    const baseDate = sub.trialEnd && sub.trialEnd > new Date()
      ? sub.trialEnd
      : new Date();
    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        trialEnd: newTrialEnd,
        status: "trialing",
        tier: sub.tier === SubscriptionTier.STARTER ? SubscriptionTier.PRO : sub.tier,
      },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.extend_trial",
      targetType: "subscription",
      targetId: sub.id,
      details: {
        days,
        previousTrialEnd: sub.trialEnd,
        newTrialEnd,
        email: sub.user.email,
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

    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    });
    if (!sub) throw new NotFoundException("Subscription not found for user");

    const updated = await this.prisma.subscription.update({
      where: { userId },
      data: {
        tier,
        status: "active",
        currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
      },
    });

    await this.auditLog.log({
      adminId,
      action: "subscription.comp",
      targetType: "subscription",
      targetId: sub.id,
      details: { tier, expiresAt, email: sub.user.email },
      ipAddress: ip,
    });

    return updated;
  }
}
