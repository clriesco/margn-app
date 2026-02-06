import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import { CreateContributionDto } from "./dto/create-contribution.dto";

@Injectable()
export class ContributionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record a contribution and immediately update equity
   * When you register a contribution, it goes directly to equity - no "pending" state
   */
  async recordContribution(dto: CreateContributionDto) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: dto.portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // Get current equity from latest metrics BEFORE creating contribution
    // This ensures we set the contribution date correctly
    const dailyMetricClient = this.prisma.dailyMetric;
    const latestDailyMetric = dailyMetricClient
      ? await dailyMetricClient.findFirst({
          where: { portfolioId: dto.portfolioId },
          orderBy: { date: "desc" },
        })
      : null;

    const latestMetrics = await this.prisma.metricsTimeseries.findFirst({
      where: { portfolioId: dto.portfolioId },
      orderBy: { date: "desc" },
    });

    // Determine type and effective amount
    const isWithdrawal = dto.type === "withdrawal";
    const effectiveAmount = isWithdrawal ? -dto.amount : dto.amount;

    // Set contribution timestamp to NOW (with full date and time)
    // This allows metrics-refresh to compare timestamps and find contributions made after metrics
    const contributedAt = new Date(); // Current timestamp with full date and time

    // Withdrawal validation: can't withdraw more than current equity
    if (isWithdrawal) {
      const currentEquity =
        latestDailyMetric?.equity ??
        latestMetrics?.equity ??
        portfolio.initialCapital;

      if (dto.amount > currentEquity) {
        throw new BadRequestException(
          `El retiro ($${dto.amount.toFixed(2)}) excede el equity actual ($${currentEquity.toFixed(2)})`
        );
      }
    }

    // Create contribution record - mark as deployed immediately since it goes to equity
    const contribution = await this.prisma.monthlyContribution.create({
      data: {
        portfolioId: dto.portfolioId,
        amount: dto.amount, // Always positive
        type: isWithdrawal ? "withdrawal" : "contribution",
        note: dto.note,
        contributedAt: contributedAt, // Use current timestamp (DateTime with full date and time)
        deployed: true, // Immediately deployed - goes to equity
        deployedAmount: dto.amount,
        deploymentReason: isWithdrawal ? "withdrawal" : "manual",
      },
    });

    // Calculate current exposure from positions
    let exposure = 0;
    const latestPrices: Record<string, number> = {};

    for (const position of portfolio.positions) {
      const latestPrice = await this.prisma.assetPrice.findFirst({
        where: { assetId: position.assetId },
        orderBy: { date: "desc" },
      });
      const price = latestPrice?.close || position.avgPrice;
      latestPrices[position.assetId] = price;
      exposure += position.quantity * price;
    }

    // Current equity (before contribution/withdrawal)
    const currentEquity =
      latestDailyMetric?.equity ??
      latestMetrics?.equity ??
      portfolio.initialCapital;

    // New equity after contribution/withdrawal (effectiveAmount is negative for withdrawals)
    const newEquity = currentEquity + effectiveAmount;

    // Calculate new leverage
    const newLeverage = newEquity > 0 ? exposure / newEquity : 0;

    // Calculate peak equity
    let peakEquity = newEquity;
    if (latestDailyMetric?.peakEquity) {
      peakEquity = Math.max(latestDailyMetric.peakEquity, newEquity);
    } else if (latestMetrics) {
      // Get peak from all metrics
      const allMetrics = await this.prisma.metricsTimeseries.findMany({
        where: { portfolioId: dto.portfolioId },
        select: { equity: true },
      });
      for (const m of allMetrics) {
        if (m.equity > peakEquity) {
          peakEquity = m.equity;
        }
      }
      peakEquity = Math.max(peakEquity, newEquity);
    }

    // Calculate margin ratio
    const marginRatio = exposure > 0 ? newEquity / exposure : 1;

    // Get today's date in UTC to avoid timezone issues
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    // Get borrowedAmount from latest metrics (should remain constant unless rebalance)
    let borrowedAmount: number | null = null;
    if (
      latestDailyMetric &&
      latestDailyMetric.borrowedAmount !== null &&
      latestDailyMetric.borrowedAmount !== undefined
    ) {
      borrowedAmount = latestDailyMetric.borrowedAmount;
    } else if (latestMetrics && latestMetrics.borrowedAmount !== null) {
      borrowedAmount = latestMetrics.borrowedAmount;
    } else {
      // Calculate borrowedAmount from exposure and equity
      borrowedAmount = exposure - newEquity;
    }

    // Update or create daily metric with new equity
    if (dailyMetricClient) {
      await dailyMetricClient.upsert({
        where: {
          portfolioId_date: {
            portfolioId: dto.portfolioId,
            date: today,
          },
        },
        create: {
          portfolioId: dto.portfolioId,
          date: today,
          equity: newEquity,
          exposure,
          leverage: newLeverage,
          peakEquity,
          marginRatio,
          borrowedAmount,
        },
        update: {
          equity: newEquity,
          exposure,
          leverage: newLeverage,
          peakEquity,
          marginRatio,
          borrowedAmount,
        },
      });
    }

    // Calculate current portfolio composition
    const composition = portfolio.positions.map((pos: any) => {
      const price = latestPrices[pos.assetId] || pos.avgPrice;
      const value = pos.quantity * price;
      const weight = exposure > 0 ? value / exposure : 0;

      return {
        symbol: pos.asset.symbol,
        name: pos.asset.name,
        weight,
        value,
        quantity: pos.quantity,
      };
    });

    // Get existing metric to preserve metadata arrays
    const existingMetric = await this.prisma.metricsTimeseries.findFirst({
      where: {
        portfolioId: dto.portfolioId,
        date: today,
      },
    });

    // Build metadata: add contribution to contributions array, preserve other arrays
    let metadata: any = {
      source: "contribution",
      composition,
      updatedAt: new Date().toISOString(),
    };

    if (existingMetric && existingMetric.metadataJson) {
      try {
        const existingMetadata = JSON.parse(existingMetric.metadataJson);
        // Preserve existing arrays
        if (existingMetadata.contributions) {
          metadata.contributions = existingMetadata.contributions;
        } else {
          metadata.contributions = [];
        }
        if (existingMetadata.rebalances) {
          metadata.rebalances = existingMetadata.rebalances;
        }
        if (existingMetadata.manualUpdates) {
          metadata.manualUpdates = existingMetadata.manualUpdates;
        }
        // NOTE: DO NOT preserve source - we want source = "contribution" for this update
        // This allows metrics-refresh to know the equity was updated by a contribution
      } catch {
        // If parsing fails, start fresh
        metadata.contributions = [];
      }
    } else {
      metadata.contributions = [];
    }

    // Add new contribution to the array
    metadata.contributions.push({
      contributionId: contribution.id,
      contributionAmount: dto.amount,
      contributionType: isWithdrawal ? "withdrawal" : "contribution",
      contributedAt: contributedAt.toISOString(),
      composition: composition,
    });

    // IMPORTANT: Also update metrics_timeseries to ensure analytics reflect the contribution
    await this.prisma.metricsTimeseries.upsert({
      where: {
        portfolioId_date: {
          portfolioId: dto.portfolioId,
          date: today,
        },
      },
      create: {
        portfolioId: dto.portfolioId,
        date: today,
        equity: newEquity,
        exposure,
        leverage: newLeverage,
        borrowedAmount,
        marginRatio,
        metadataJson: JSON.stringify(metadata),
      },
      update: {
        equity: newEquity,
        exposure,
        leverage: newLeverage,
        borrowedAmount,
        marginRatio,
        metadataJson: JSON.stringify(metadata),
      },
    });

    console.log(`[ContributionsService] ${isWithdrawal ? "Withdrawal" : "Contribution"} recorded: $${dto.amount}`);
    console.log(`  - Previous equity: $${currentEquity.toFixed(2)}`);
    console.log(`  - New equity: $${newEquity.toFixed(2)}`);
    console.log(
      `  - Borrowed amount: ${
        borrowedAmount !== null ? `$${borrowedAmount.toFixed(2)}` : "null"
      }`
    );

    return contribution;
  }
}
