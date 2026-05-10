import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  RISK_PROFILES,
  detectRiskProfile,
  isValidRiskProfileId,
  type RiskProfileId,
} from "../shared";

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
        targetAssets: {
          where: { enabled: true },
          include: { asset: true },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // Get target weights from the new PortfolioTargetAsset model (preferred)
    // or fall back to legacy targetWeightsJson
    let targetWeights: Record<string, number> = {};

    if (portfolio.targetAssets && portfolio.targetAssets.length > 0) {
      // Use new model: PortfolioTargetAsset
      for (const ta of portfolio.targetAssets) {
        targetWeights[(ta as any).asset.symbol] = ta.targetWeight;
      }
    } else if (portfolio.targetWeightsJson) {
      // Fallback to legacy JSON field
      try {
        targetWeights = JSON.parse(portfolio.targetWeightsJson);
      } catch {
        targetWeights = {};
      }
    }

    // Get all asset symbols from both target assets AND positions
    const targetAssetSymbols = portfolio.targetAssets?.map(
      (ta: any) => ta.asset.symbol
    ) || [];
    const positionSymbols = (portfolio.positions as any[]).map(
      (p: any) => p.asset.symbol
    );
    const allAssetSymbols = [...new Set([...targetAssetSymbols, ...positionSymbols])];

    // Ensure ALL assets are in targetWeights (add with 0 if missing)
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

    // Detect or use stored risk profile
    const storedProfile = portfolio.riskProfile as RiskProfileId | null;
    const detectedProfile = storedProfile || detectRiskProfile({
      leverageMin: portfolio.leverageMin,
      leverageMax: portfolio.leverageMax,
      leverageTarget: portfolio.leverageTarget,
    });

    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      baseCurrency: portfolio.baseCurrency,
      initialCapital: portfolio.initialCapital,

      // Risk profile
      riskProfile: detectedProfile,
      riskProfileName: detectedProfile ? RISK_PROFILES[detectedProfile].name : null,

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
      safeMarginRatio: portfolio.safeMarginRatio,
      criticalMarginRatio: portfolio.criticalMarginRatio,

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
      optimizationObjective: portfolio.optimizationObjective,

      // Broker settings
      requireWholeShares: portfolio.requireWholeShares,

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

    // If a risk profile is provided, apply its parameters
    if (dto.riskProfile !== undefined) {
      if (dto.riskProfile === null) {
        // Explicitly setting to custom (null)
        updateData.riskProfile = null;
      } else if (isValidRiskProfileId(dto.riskProfile)) {
        const profileParams = RISK_PROFILES[dto.riskProfile].params;
        updateData.riskProfile = dto.riskProfile;
        updateData.leverageMin = profileParams.leverageMin;
        updateData.leverageMax = profileParams.leverageMax;
        updateData.leverageTarget = profileParams.leverageTarget;
        updateData.maintenanceMarginRatio = profileParams.maintenanceMarginRatio;
        updateData.meanReturnShrinkage = profileParams.meanReturnShrinkage;
        updateData.maxWeight = profileParams.maxWeight;
        updateData.minWeight = profileParams.minWeight;
        updateData.optimizationObjective = profileParams.optimizationObjective;
      }
    }

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

    // Leverage settings (only apply if not already set by risk profile)
    if (dto.leverageMin !== undefined && updateData.leverageMin === undefined) {
      updateData.leverageMin = dto.leverageMin;
      // Mark as custom if manually setting leverage
      if (updateData.riskProfile === undefined) {
        updateData.riskProfile = null;
      }
    }
    if (dto.leverageMax !== undefined && updateData.leverageMax === undefined) {
      updateData.leverageMax = dto.leverageMax;
      if (updateData.riskProfile === undefined) {
        updateData.riskProfile = null;
      }
    }
    if (dto.leverageTarget !== undefined && updateData.leverageTarget === undefined) {
      updateData.leverageTarget = dto.leverageTarget;
      if (updateData.riskProfile === undefined) {
        updateData.riskProfile = null;
      }
    }

    // Target weights (store as JSON string AND sync to PortfolioTargetAsset)
    if (dto.targetWeights !== undefined) {
      updateData.targetWeightsJson = JSON.stringify(dto.targetWeights);

      // Also sync to the new PortfolioTargetAsset model
      await this.syncTargetAssetsFromWeights(portfolioId, dto.targetWeights);
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
    if (dto.safeMarginRatio !== undefined) {
      updateData.safeMarginRatio = dto.safeMarginRatio;
    }
    if (dto.criticalMarginRatio !== undefined) {
      updateData.criticalMarginRatio = dto.criticalMarginRatio;
    }

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
    if (dto.optimizationObjective !== undefined) {
      updateData.optimizationObjective = dto.optimizationObjective;
    }

    // Broker settings
    if (dto.requireWholeShares !== undefined) {
      updateData.requireWholeShares = dto.requireWholeShares;
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
   * Sync target weights from the legacy JSON format to PortfolioTargetAsset records
   * @param portfolioId - Portfolio ID
   * @param weights - Target weights object
   */
  private async syncTargetAssetsFromWeights(
    portfolioId: string,
    weights: Record<string, number>
  ): Promise<void> {
    // Get all assets by symbol
    const symbols = Object.keys(weights);
    const assets = await this.prisma.asset.findMany({
      where: { symbol: { in: symbols } },
    });
    const assetMap = new Map(assets.map(a => [a.symbol, a.id]));

    // Get existing target assets
    const existingTargetAssets = await this.prisma.portfolioTargetAsset.findMany({
      where: { portfolioId },
      include: { asset: true },
    });
    const existingMap = new Map(
      existingTargetAssets.map(ta => [(ta as any).asset.symbol, ta])
    );

    // Update or create target assets
    for (const [symbol, weight] of Object.entries(weights)) {
      const assetId = assetMap.get(symbol);
      if (!assetId) continue; // Asset doesn't exist in DB

      const existing = existingMap.get(symbol);
      if (existing) {
        // Update existing
        await this.prisma.portfolioTargetAsset.update({
          where: { id: existing.id },
          data: { targetWeight: weight, enabled: weight > 0 },
        });
      } else {
        // Create new
        await this.prisma.portfolioTargetAsset.create({
          data: {
            portfolioId,
            assetId,
            targetWeight: weight,
            enabled: weight > 0,
          },
        });
      }
    }

    // Disable target assets not in the weights object
    for (const [symbol, ta] of existingMap) {
      if (!(symbol in weights)) {
        await this.prisma.portfolioTargetAsset.update({
          where: { id: ta.id },
          data: { enabled: false, targetWeight: 0 },
        });
      }
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
