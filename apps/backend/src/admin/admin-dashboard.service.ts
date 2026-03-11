import { Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalUsers,
      active30d,
      bannedUsers,
      newThisWeek,
      subscriptionsByTier,
      totalPortfolios,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { updatedAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.user.count({
        where: { bannedAt: { not: null } },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      this.prisma.subscription.groupBy({
        by: ["tier"],
        _count: true,
      }),
      this.prisma.portfolio.count(),
    ]);

    // Calculate MRR from tier counts
    const tierPricing: Record<string, number> = {
      starter: 0,
      pro: 19,
      institutional: 49,
    };

    const tierCounts: Record<string, number> = {};
    let mrr = 0;
    for (const row of subscriptionsByTier) {
      tierCounts[row.tier] = row._count;
      mrr += (tierPricing[row.tier] ?? 0) * row._count;
    }

    return {
      users: {
        total: totalUsers,
        active30d,
        banned: bannedUsers,
        newThisWeek,
      },
      subscriptions: {
        starter: tierCounts["starter"] ?? 0,
        pro: tierCounts["pro"] ?? 0,
        institutional: tierCounts["institutional"] ?? 0,
      },
      revenue: {
        mrr,
        estimatedArr: mrr * 12,
      },
      portfolios: {
        total: totalPortfolios,
      },
    };
  }

  async getRecentActivity(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [recentSignups, recentContributions, recentRebalances] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { createdAt: { gte: since } },
          select: { id: true, email: true, fullName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        this.prisma.monthlyContribution.findMany({
          where: { contributedAt: { gte: since } },
          select: {
            id: true,
            amount: true,
            type: true,
            contributedAt: true,
            portfolio: {
              select: {
                name: true,
                user: { select: { email: true } },
              },
            },
          },
          orderBy: { contributedAt: "desc" },
          take: 20,
        }),
        this.prisma.rebalanceEvent.findMany({
          where: { createdAt: { gte: since } },
          select: {
            id: true,
            triggeredBy: true,
            createdAt: true,
            portfolio: {
              select: {
                name: true,
                user: { select: { email: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

    return { recentSignups, recentContributions, recentRebalances };
  }
}
