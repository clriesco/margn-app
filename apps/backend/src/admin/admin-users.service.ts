import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { AuditLogService } from "./audit-log.service";

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService
  ) {}

  async findMany(params: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const { page = 1, limit = 20 } = params;
    const where: any = {};

    if (params.search) {
      where.OR = [
        { email: { contains: params.search, mode: "insensitive" } },
        { fullName: { contains: params.search, mode: "insensitive" } },
      ];
    }

    if (params.status === "banned") {
      where.bannedAt = { not: null };
    } else if (params.status === "active") {
      where.bannedAt = null;
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          subscription: { select: { tier: true, status: true } },
          _count: { select: { portfolios: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: data.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        bannedAt: u.bannedAt,
        createdAt: u.createdAt,
        tier: u.subscription?.tier || "starter",
        subscriptionStatus: u.subscription?.status || "none",
        portfolioCount: u._count.portfolios,
      })),
      meta: { total, page, limit },
    };
  }

  async findOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
        portfolios: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            _count: { select: { positions: true } },
          },
        },
        _count: {
          select: {
            portfolios: true,
            savedStrategies: true,
          },
        },
      },
    });

    if (!user) throw new NotFoundException("User not found");

    // Get latest metrics for each portfolio
    const portfoliosWithMetrics = await Promise.all(
      user.portfolios.map(async (p) => {
        const latestMetric = await this.prisma.dailyMetric.findFirst({
          where: { portfolioId: p.id },
          orderBy: { date: "desc" },
        });
        return {
          ...p,
          positionCount: p._count.positions,
          equity: latestMetric?.equity ?? null,
          leverage: latestMetric?.leverage ?? null,
        };
      })
    );

    // Recent contributions
    const recentContributions = await this.prisma.monthlyContribution.findMany({
      where: {
        portfolio: { userId },
      },
      orderBy: { contributedAt: "desc" },
      take: 10,
      include: { portfolio: { select: { name: true } } },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      clerkId: user.clerkId,
      role: user.role,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      subscription: user.subscription
        ? {
            tier: user.subscription.tier,
            status: user.subscription.status,
            billingInterval: user.subscription.billingInterval,
            currentPeriodEnd: user.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
            trialEnd: user.subscription.trialEnd,
            stripeCustomerId: user.subscription.stripeCustomerId,
          }
        : null,
      portfolios: portfoliosWithMetrics,
      recentContributions,
      counts: {
        portfolios: user._count.portfolios,
        strategies: user._count.savedStrategies,
      },
    };
  }

  async updateRole(
    adminId: string,
    userId: string,
    role: string,
    ip?: string
  ) {
    if (!["user", "admin"].includes(role)) {
      throw new BadRequestException("Invalid role");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, email: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await this.auditLog.log({
      adminId,
      action: "user.update_role",
      targetType: "user",
      targetId: userId,
      details: { before: { role: user.role }, after: { role }, email: user.email },
      ipAddress: ip,
    });

    return updated;
  }

  async banUser(
    adminId: string,
    userId: string,
    reason: string,
    ip?: string
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (user.bannedAt) throw new BadRequestException("User is already banned");

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: new Date(), banReason: reason },
      select: { id: true, email: true, bannedAt: true, banReason: true },
    });

    await this.auditLog.log({
      adminId,
      action: "user.ban",
      targetType: "user",
      targetId: userId,
      details: { reason, email: user.email },
      ipAddress: ip,
    });

    return updated;
  }

  async unbanUser(adminId: string, userId: string, ip?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, bannedAt: true },
    });
    if (!user) throw new NotFoundException("User not found");
    if (!user.bannedAt) throw new BadRequestException("User is not banned");

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { bannedAt: null, banReason: null },
      select: { id: true, email: true, bannedAt: true },
    });

    await this.auditLog.log({
      adminId,
      action: "user.unban",
      targetType: "user",
      targetId: userId,
      details: { email: user.email },
      ipAddress: ip,
    });

    return updated;
  }
}
