import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import {
  UpdatePortfolioConfigurationDto,
  PortfolioConfigurationResponse,
} from "./dto/portfolio-configuration.dto";

/**
 * Default target weights (fallback if none configured)
 */
const DEFAULT_TARGET_WEIGHTS: Record<string, number> = {
  SPY: 0.6,
  GLD: 0.25,
  "BTC-USD": 0.15,
};

/**
 * Service for managing portfolio configuration
 */
@Injectable()
export class PortfolioConfigurationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get portfolio configuration
   * @param portfolioId - Portfolio ID
   * @returns Portfolio configuration
   */
  async getConfiguration(
    portfolioId: string
  ): Promise<PortfolioConfigurationResponse> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // Get all asset symbols from current positions
    const allAssetSymbols = (portfolio.positions as any[]).map(
      (p: any) => p.asset.symbol
    );

    // Parse target weights from JSON or use defaults
    let targetWeights: Record<string, number> = {};
    if (portfolio.targetWeightsJson) {
      try {
        targetWeights = JSON.parse(portfolio.targetWeightsJson);
      } catch {
        // If parsing fails, start with empty object
        targetWeights = {};
      }
    }

    // Ensure ALL current portfolio assets are in targetWeights
    // If an asset is missing, add it with weight 0
    for (const symbol of allAssetSymbols) {
      if (!(symbol in targetWeights)) {
        targetWeights[symbol] = 0;
      }
    }

    // If no weights configured at all, use defaults for known assets
    const hasAnyWeight = Object.values(targetWeights).some((w) => w > 0);
    if (!hasAnyWeight && allAssetSymbols.length === 0) {
      targetWeights = DEFAULT_TARGET_WEIGHTS;
    }

    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      initialCapital: portfolio.initialCapital,

      // Contribution settings
      monthlyContribution: portfolio.monthlyContribution,
      contributionFrequency:
        (portfolio.contributionFrequency as
          | "weekly"
          | "biweekly"
          | "monthly"
          | "quarterly") || "monthly",
      contributionDayOfMonth: portfolio.contributionDayOfMonth,
      contributionEnabled: portfolio.contributionEnabled,

      // Leverage settings
      leverageMin: portfolio.leverageMin,
      leverageMax: portfolio.leverageMax,
      leverageTarget: portfolio.leverageTarget,

      // Target weights
      targetWeights,

      // Weight constraints
      maxWeight: portfolio.maxWeight,
      minWeight: portfolio.minWeight,

      // Risk parameters
      maintenanceMarginRatio: portfolio.maintenanceMarginRatio,
      safeMarginRatio: null, // Field not yet in DB schema
      criticalMarginRatio: null, // Field not yet in DB schema

      // Deploy signal thresholds
      drawdownRedeployThreshold: portfolio.drawdownRedeployThreshold,
      weightDeviationThreshold: portfolio.weightDeviationThreshold,
      volatilityLookbackDays: portfolio.volatilityLookbackDays,
      volatilityRedeployThreshold: portfolio.volatilityRedeployThreshold,
      gradualDeployFactor: portfolio.gradualDeployFactor,

      // Optimization parameters
      useDynamicSharpeRebalance: portfolio.useDynamicSharpeRebalance,
      sharpeWeightsLookbackMonths: portfolio.sharpeWeightsLookbackMonths,
      meanReturnShrinkage: portfolio.meanReturnShrinkage,
      riskFreeRate: portfolio.riskFreeRate,

      // Metadata
      updatedAt: portfolio.updatedAt.toISOString(),
    };
  }

  /**
   * Update portfolio configuration
   * @param portfolioId - Portfolio ID
   * @param dto - Update DTO
   * @returns Updated portfolio configuration
   */
  async updateConfiguration(
    portfolioId: string,
    dto: UpdatePortfolioConfigurationDto
  ): Promise<PortfolioConfigurationResponse> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // Validate target weights if provided
    if (dto.targetWeights) {
      this.validateTargetWeights(dto.targetWeights);
    }

    // Validate leverage settings
    if (dto.leverageMin !== undefined || dto.leverageMax !== undefined) {
      const newMin = dto.leverageMin ?? portfolio.leverageMin;
      const newMax = dto.leverageMax ?? portfolio.leverageMax;

      if (newMin > newMax) {
        throw new BadRequestException(
          "leverageMin cannot be greater than leverageMax"
        );
      }
    }

    // Build update data
    const updateData: Record<string, any> = {};

    // Contribution settings
    if (dto.monthlyContribution !== undefined) {
      updateData.monthlyContribution = dto.monthlyContribution;
    }
    if (dto.contributionFrequency !== undefined) {
      updateData.contributionFrequency = dto.contributionFrequency;
    }
    if (dto.contributionDayOfMonth !== undefined) {
      updateData.contributionDayOfMonth = dto.contributionDayOfMonth;
    }
    if (dto.contributionEnabled !== undefined) {
      updateData.contributionEnabled = dto.contributionEnabled;
    }

    // Leverage settings
    if (dto.leverageMin !== undefined) {
      updateData.leverageMin = dto.leverageMin;
    }
    if (dto.leverageMax !== undefined) {
      updateData.leverageMax = dto.leverageMax;
    }
    if (dto.leverageTarget !== undefined) {
      updateData.leverageTarget = dto.leverageTarget;
    }

    // Target weights (store as JSON string)
    if (dto.targetWeights !== undefined) {
      updateData.targetWeightsJson = JSON.stringify(dto.targetWeights);
    }

    // Weight constraints
    if (dto.maxWeight !== undefined) {
      updateData.maxWeight = dto.maxWeight;
    }
    if (dto.minWeight !== undefined) {
      updateData.minWeight = dto.minWeight;
    }

    // Risk parameters
    if (dto.maintenanceMarginRatio !== undefined) {
      updateData.maintenanceMarginRatio = dto.maintenanceMarginRatio;
    }
    // safeMarginRatio and criticalMarginRatio not yet in DB schema
    // if (dto.safeMarginRatio !== undefined) {
    //   updateData.safeMarginRatio = dto.safeMarginRatio;
    // }
    // if (dto.criticalMarginRatio !== undefined) {
    //   updateData.criticalMarginRatio = dto.criticalMarginRatio;
    // }

    // Deploy signal thresholds
    if (dto.drawdownRedeployThreshold !== undefined) {
      updateData.drawdownRedeployThreshold = dto.drawdownRedeployThreshold;
    }
    if (dto.weightDeviationThreshold !== undefined) {
      updateData.weightDeviationThreshold = dto.weightDeviationThreshold;
    }
    if (dto.volatilityLookbackDays !== undefined) {
      updateData.volatilityLookbackDays = dto.volatilityLookbackDays;
    }
    if (dto.volatilityRedeployThreshold !== undefined) {
      updateData.volatilityRedeployThreshold = dto.volatilityRedeployThreshold;
    }
    if (dto.gradualDeployFactor !== undefined) {
      updateData.gradualDeployFactor = dto.gradualDeployFactor;
    }

    // Optimization parameters
    if (dto.useDynamicSharpeRebalance !== undefined) {
      updateData.useDynamicSharpeRebalance = dto.useDynamicSharpeRebalance;
    }
    if (dto.sharpeWeightsLookbackMonths !== undefined) {
      updateData.sharpeWeightsLookbackMonths = dto.sharpeWeightsLookbackMonths;
    }
    if (dto.meanReturnShrinkage !== undefined) {
      updateData.meanReturnShrinkage = dto.meanReturnShrinkage;
    }
    if (dto.riskFreeRate !== undefined) {
      updateData.riskFreeRate = dto.riskFreeRate;
    }

    // Update portfolio
    await this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: updateData,
    });

    // Return updated configuration
    return this.getConfiguration(portfolioId);
  }

  /**
   * Validate target weights
   * - All weights must be between 0 and 1
   * - Sum of weights must be approximately 1 (allowing small tolerance)
   * @param weights - Target weights object
   */
  validateTargetWeights(weights: Record<string, number>): void {
    if (!weights || typeof weights !== "object") {
      throw new BadRequestException("targetWeights must be an object");
    }

    const symbols = Object.keys(weights);

    if (symbols.length === 0) {
      throw new BadRequestException(
        "targetWeights must have at least one asset"
      );
    }

    let sum = 0;

    for (const symbol of symbols) {
      const weight = weights[symbol];

      if (typeof weight !== "number" || isNaN(weight)) {
        throw new BadRequestException(
          `Weight for ${symbol} must be a valid number`
        );
      }

      if (weight < 0 || weight > 1) {
        throw new BadRequestException(
          `Weight for ${symbol} must be between 0 and 1`
        );
      }

      sum += weight;
    }

    // Allow small tolerance for floating point
    const tolerance = 0.001;
    if (Math.abs(sum - 1) > tolerance) {
      throw new BadRequestException(
        `Target weights must sum to 1.0 (100%). Current sum: ${(
          sum * 100
        ).toFixed(2)}%`
      );
    }
  }

  /**
   * Get target weights for a portfolio
   * @param portfolioId - Portfolio ID
   * @returns Target weights object
   */
  async getTargetWeights(portfolioId: string): Promise<Record<string, number>> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { targetWeightsJson: true },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    if (portfolio.targetWeightsJson) {
      try {
        return JSON.parse(portfolio.targetWeightsJson);
      } catch {
        return DEFAULT_TARGET_WEIGHTS;
      }
    }

    return DEFAULT_TARGET_WEIGHTS;
  }

  /**
   * Check if today is the contribution day for a portfolio
   * @param portfolioId - Portfolio ID
   * @returns Boolean indicating if today is contribution day
   */
  async isContributionDay(portfolioId: string): Promise<boolean> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: {
        contributionEnabled: true,
        contributionFrequency: true,
        contributionDayOfMonth: true,
      },
    });

    if (!portfolio || !portfolio.contributionEnabled) {
      return false;
    }

    const today = new Date();
    const frequency = portfolio.contributionFrequency || "monthly";
    const dayValue = portfolio.contributionDayOfMonth;

    switch (frequency) {
      case "weekly": {
        // Day of week (0 = Sunday, 6 = Saturday)
        const dayOfWeek = today.getDay();
        return dayOfWeek === dayValue;
      }
      case "biweekly": {
        // Day of week, but only every other week
        const dayOfWeek = today.getDay();
        if (dayOfWeek !== dayValue) return false;

        // Calculate weeks since a reference date (e.g., Jan 1, 2024)
        const referenceDate = new Date(2024, 0, 1); // Jan 1, 2024
        const daysDiff = Math.floor(
          (today.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const weeksSinceReference = Math.floor(daysDiff / 7);
        return weeksSinceReference % 2 === 0;
      }
      case "monthly": {
        // Day of month (1-31)
        const dayOfMonth = today.getDate();
        const lastDayOfMonth = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0
        ).getDate();
        const targetDay = Math.min(dayValue, lastDayOfMonth);
        return dayOfMonth === targetDay;
      }
      case "quarterly": {
        // Day of month, but only in Jan, Apr, Jul, Oct
        const month = today.getMonth(); // 0 = Jan, 3 = Apr, 6 = Jul, 9 = Oct
        if (month !== 0 && month !== 3 && month !== 6 && month !== 9) {
          return false;
        }
        const dayOfMonth = today.getDate();
        const lastDayOfMonth = new Date(
          today.getFullYear(),
          today.getMonth() + 1,
          0
        ).getDate();
        const targetDay = Math.min(dayValue, lastDayOfMonth);
        return dayOfMonth === targetDay;
      }
      default:
        return false;
    }
  }

  /**
   * Get next contribution date for a portfolio
   * @param portfolioId - Portfolio ID
   * @returns Next contribution date or null if disabled
   */
  async getNextContributionDate(portfolioId: string): Promise<Date | null> {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: {
        contributionEnabled: true,
        contributionFrequency: true,
        contributionDayOfMonth: true,
      },
    });

    if (!portfolio || !portfolio.contributionEnabled) {
      return null;
    }

    const today = new Date();
    const frequency = portfolio.contributionFrequency || "monthly";
    const dayValue = portfolio.contributionDayOfMonth;

    switch (frequency) {
      case "weekly": {
        // Next occurrence of the day of week
        const dayOfWeek = today.getDay();
        const daysUntilNext = (dayValue - dayOfWeek + 7) % 7 || 7; // If today is the day, return next week
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + daysUntilNext);
        return nextDate;
      }
      case "biweekly": {
        // Next occurrence of the day of week, every 2 weeks
        const dayOfWeek = today.getDay();
        let daysUntilNext = (dayValue - dayOfWeek + 7) % 7;
        if (daysUntilNext === 0)
          daysUntilNext = 14; // If today is the day, return in 2 weeks
        else if (daysUntilNext === 7) daysUntilNext = 7; // Next week
        else {
          // Check if next week is the right week
          const weeksSinceReference = Math.floor(
            (today.getTime() - new Date(2024, 0, 1).getTime()) /
              (1000 * 60 * 60 * 24 * 7)
          );
          if (weeksSinceReference % 2 === 0) {
            daysUntilNext = 7 + daysUntilNext; // Skip to the week after next
          }
        }
        const nextDate = new Date(today);
        nextDate.setDate(today.getDate() + daysUntilNext);
        return nextDate;
      }
      case "monthly": {
        // Next occurrence of the day of month
        let nextDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          dayValue
        );

        // If today is past the target day, move to next month
        if (today.getDate() > dayValue) {
          nextDate = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            dayValue
          );
        }

        // Handle end-of-month edge case
        const lastDayOfMonth = new Date(
          nextDate.getFullYear(),
          nextDate.getMonth() + 1,
          0
        ).getDate();

        if (dayValue > lastDayOfMonth) {
          nextDate.setDate(lastDayOfMonth);
        }

        return nextDate;
      }
      case "quarterly": {
        // Next occurrence in Jan, Apr, Jul, or Oct
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        // Determine next quarter month
        let nextQuarterMonth: number;
        if (currentMonth < 3) nextQuarterMonth = 3; // Apr
        else if (currentMonth < 6) nextQuarterMonth = 6; // Jul
        else if (currentMonth < 9) nextQuarterMonth = 9; // Oct
        else nextQuarterMonth = 0; // Jan (next year)

        let nextYear = today.getFullYear();
        if (nextQuarterMonth === 0) nextYear++;

        // If we're in a quarter month and haven't passed the day, use current month
        if (
          (currentMonth === 0 ||
            currentMonth === 3 ||
            currentMonth === 6 ||
            currentMonth === 9) &&
          currentDay <= dayValue
        ) {
          nextQuarterMonth = currentMonth;
          nextYear = today.getFullYear();
        }

        const nextDate = new Date(nextYear, nextQuarterMonth, dayValue);

        // Handle end-of-month edge case
        const lastDayOfMonth = new Date(
          nextDate.getFullYear(),
          nextDate.getMonth() + 1,
          0
        ).getDate();

        if (dayValue > lastDayOfMonth) {
          nextDate.setDate(lastDayOfMonth);
        }

        return nextDate;
      }
      default:
        return null;
    }
  }
}
