import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

import {
  PortfolioRecommendationsResponse,
  PortfolioCurrentState,
  DeploySignals,
  Recommendation,
  PurchaseRecommendation,
  ExtraContributionRecommendation,
  RecommendationPriority,
} from "./dto/portfolio-recommendations.dto";
import { PortfolioConfigurationService } from "./portfolio-configuration.service";

/**
 * Asset unit mapping based on asset type
 */
const ASSET_UNITS: Record<string, string> = {
  commodity: "oz",
  crypto: "units",
  index: "shares",
  bond: "shares",
  stock: "shares",
};

/**
 * Special unit overrides for specific symbols
 */
const SYMBOL_UNITS: Record<string, string> = {
  "BTC-USD": "BTC",
  "ETH-USD": "ETH",
  GLD: "shares", // GLD is actually shares, not oz
  IAU: "shares",
};

/**
 * Service for generating portfolio recommendations
 * Implements the strategy from montecarlo-quantfury README
 */
@Injectable()
export class PortfolioRecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: PortfolioConfigurationService
  ) {}

  /**
   * Get recommendations for a portfolio
   * Main entry point that orchestrates all calculations
   */
  async getRecommendations(
    portfolioId: string
  ): Promise<PortfolioRecommendationsResponse> {
    // 1. Get portfolio with all related data
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
        contributions: {
          where: { deployed: false } as any,
          orderBy: { contributedAt: "desc" },
        },
        metricsTimeseries: {
          orderBy: { date: "desc" },
          take: 100, // For volatility calculation
        },
        dailyMetrics: {
          orderBy: { date: "desc" },
          take: 1,
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // 2. Get configuration and target weights
    const config = await this.configService.getConfiguration(portfolioId);
    const targetWeights = config.targetWeights;

    // 3. Get latest prices
    const latestPrices = await this.getLatestPrices(
      (portfolio.positions as any[]).map((p: any) => p.assetId)
    );

    // 4. Calculate current state
    const currentState = this.calculateCurrentState(portfolio, latestPrices);

    // 5. Evaluate deploy signals
    const signals = this.evaluateDeploySignals(
      portfolio,
      currentState,
      targetWeights
    );

    // 6. Check contribution day
    const isContributionDay = await this.configService.isContributionDay(
      portfolioId
    );
    const nextContributionDate =
      await this.configService.getNextContributionDate(portfolioId);

    // 7. Generate recommendations based on state
    const recommendations = await this.generateRecommendations(
      portfolio,
      currentState,
      config,
      targetWeights,
      latestPrices,
      isContributionDay
    );

    // 8. Determine leverage status
    const leverageStatus = this.getLeverageStatus(
      currentState.leverage,
      config.leverageMin,
      config.leverageMax
    );

    // 9. Build response
    return {
      portfolioId: portfolio.id,
      portfolioName: portfolio.name,
      timestamp: new Date().toISOString(),

      currentState,

      configuration: {
        leverageMin: config.leverageMin,
        leverageMax: config.leverageMax,
        leverageTarget: config.leverageTarget,
        monthlyContribution: config.monthlyContribution,
        contributionDayOfMonth: config.contributionDayOfMonth,
        targetWeights,
      },

      signals,

      recommendations,

      isContributionDay,
      nextContributionDate: nextContributionDate?.toISOString() ?? null,

      summary: {
        leverageStatus,
        actionRequired: recommendations.some(
          (r) => r.priority === "high" || r.priority === "urgent"
        ),
        primaryRecommendation:
          recommendations.length > 0 ? recommendations[0].title : null,
      },
    };
  }

  /**
   * Calculate current portfolio state
   * NOTE: Contributions go directly to equity when registered,
   * so pendingContributions should be 0 in normal operation
   */
  private calculateCurrentState(
    portfolio: any,
    latestPrices: Record<string, number>
  ): PortfolioCurrentState {
    let exposure = 0;
    const positionValues: Record<string, number> = {};
    const positionQuantities: Record<string, number> = {};

    for (const position of portfolio.positions) {
      const price = latestPrices[position.assetId] || position.avgPrice;
      const value = position.quantity * price;
      exposure += value;
      positionValues[position.asset.symbol] = value;
      positionQuantities[position.asset.symbol] = position.quantity;
    }

    // Get base equity from latest metrics or calculate
    let baseEquity = portfolio.initialCapital;
    let peakEquity = baseEquity;

    if (portfolio.dailyMetrics?.length > 0) {
      baseEquity = portfolio.dailyMetrics[0].equity;
      peakEquity = portfolio.dailyMetrics[0].peakEquity || baseEquity;
    } else if (portfolio.metricsTimeseries?.length > 0) {
      baseEquity = portfolio.metricsTimeseries[0].equity;
      // Calculate peak from history
      for (const metric of portfolio.metricsTimeseries) {
        if (metric.equity > peakEquity) {
          peakEquity = metric.equity;
        }
      }
    }

    // Calculate pending contributions (not yet deployed) - for display only
    // NOTE: Contributions are now marked as deployed immediately when registered,
    // so pending contributions should be 0 in normal operation
    const pendingContributions = portfolio.contributions
      .filter((c: any) => !c.deployed)
      .reduce((sum: number, c: any) => sum + c.amount, 0);

    // Equity should already include all contributions (they're marked as deployed immediately)
    // We do NOT add pendingContributions here to avoid double-counting
    const effectiveEquity = baseEquity;

    // Calculate leverage using effective equity
    const leverage = effectiveEquity > 0 ? exposure / effectiveEquity : 0;
    const marginRatio = exposure > 0 ? effectiveEquity / exposure : 1;

    return {
      equity: effectiveEquity, // Includes all contributions (they go directly to equity)
      exposure,
      leverage,
      marginRatio,
      peakEquity: Math.max(peakEquity, effectiveEquity),
      pendingContributions, // Should be 0 in normal operation
      positionValues,
      positionQuantities,
    };
  }

  /**
   * Evaluate deploy signals (drawdown, weight deviation, volatility)
   */
  private evaluateDeploySignals(
    portfolio: any,
    currentState: PortfolioCurrentState,
    targetWeights: Record<string, number>
  ): DeploySignals {
    const { equity, peakEquity, positionValues, exposure } = currentState;

    // 1. Calculate drawdown
    const drawdown = peakEquity > 0 ? (equity - peakEquity) / peakEquity : 0;
    const drawdownTriggered = drawdown <= -portfolio.drawdownRedeployThreshold;

    // 2. Calculate weight deviation
    let maxWeightDeviation = 0;
    if (exposure > 0) {
      for (const [symbol, targetWeight] of Object.entries(targetWeights)) {
        const currentValue = positionValues[symbol] || 0;
        const currentWeight = currentValue / exposure;
        const deviation = Math.abs(currentWeight - targetWeight);
        if (deviation > maxWeightDeviation) {
          maxWeightDeviation = deviation;
        }
      }
    }
    const weightDeviationTriggered =
      maxWeightDeviation >= portfolio.weightDeviationThreshold;

    // 3. Calculate realized volatility
    let volatility: number | null = null;
    if (portfolio.metricsTimeseries?.length >= 2) {
      const equityValues = portfolio.metricsTimeseries
        .slice(0, portfolio.volatilityLookbackDays + 1)
        .map((m: any) => m.equity)
        .reverse();

      if (equityValues.length > 1) {
        const logReturns: number[] = [];
        for (let i = 1; i < equityValues.length; i++) {
          if (equityValues[i - 1] > 0) {
            logReturns.push(Math.log(equityValues[i] / equityValues[i - 1]));
          }
        }

        if (logReturns.length > 0) {
          const mean =
            logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
          const variance =
            logReturns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
            (logReturns.length - 1 || 1);
          const dailyVol = Math.sqrt(variance);
          volatility = dailyVol * Math.sqrt(252); // Annualize
        }
      }
    }
    const volatilityTriggered =
      volatility !== null &&
      volatility <= portfolio.volatilityRedeployThreshold;

    // 4. Determine deploy fraction
    let deployFraction = 0;
    const anySignalTriggered =
      drawdownTriggered || weightDeviationTriggered || volatilityTriggered;

    if (anySignalTriggered) {
      deployFraction = portfolio.gradualDeployFactor;
    }

    return {
      drawdown,
      drawdownTriggered,
      weightDeviation: maxWeightDeviation,
      weightDeviationTriggered,
      volatility,
      volatilityTriggered,
      anySignalTriggered,
      deployFraction,
    };
  }

  /**
   * Generate recommendations based on current state and signals
   * Implements the 3 cases from the strategy
   */
  private async generateRecommendations(
    portfolio: any,
    currentState: PortfolioCurrentState,
    config: any,
    targetWeights: Record<string, number>,
    latestPrices: Record<string, number>,
    isContributionDay: boolean
  ): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    const { leverage } = currentState;
    const { leverageMin, leverageMax } = config;

    // Determine leverage status
    const leverageStatus = this.getLeverageStatus(
      leverage,
      leverageMin,
      leverageMax
    );

    // Case 1: Contribution day reminder (only if enabled, it's the day, and not already contributed)
    if (isContributionDay && config.contributionEnabled) {
      // Check if the user already contributed today
      const now = new Date();
      const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const todayEnd = new Date(todayStart);
      todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

      const todayContribution = await this.prisma.monthlyContribution.findFirst({
        where: {
          portfolioId: portfolio.id,
          contributedAt: { gte: todayStart, lt: todayEnd },
        },
      });

      if (!todayContribution) {
        recommendations.push({
          type: "contribution_due",
          priority: "medium",
          title: "Recordatorio: Aportación Mensual",
          description: `Hoy es tu día de aportación mensual. Registra tu aportación de $${
            config.monthlyContribution?.toLocaleString("es-ES") || 0
          }.`,
          actions: {
            contributionReminder: {
              suggestedAmount: config.monthlyContribution || 0,
              currency: portfolio.baseCurrency,
            },
          },
          actionUrl: "/dashboard/contribution",
        });
      }
    }

    // Case 2: Leverage LOW - Need to increase exposure (reborrow)
    if (leverageStatus === "low") {
      // Use leverage target instead of minimum to bring it to a healthy level
      // This ensures we recommend meaningful purchases, not just to reach the bare minimum
      const targetLeverageForReborrow = config.leverageTarget || leverageMin;

      const purchases = await this.calculateSpecificPurchases(
        portfolio,
        currentState,
        targetWeights,
        latestPrices,
        targetLeverageForReborrow
      );

      const totalPurchaseValue = purchases.reduce(
        (sum, p) => sum + p.valueUsd,
        0
      );

      // Only show recommendation if there are meaningful purchases to make
      if (purchases.length > 0 && totalPurchaseValue > 1) {
        recommendations.push({
          type: "leverage_low",
          priority: "high",
          title: `Leverage Bajo (${leverage.toFixed(2).replace(".", ",")}x)`,
          description: `Tu leverage efectivo está por debajo del mínimo (${leverageMin
            .toFixed(1)
            .replace(
              ".",
              ","
            )}x). Se recomienda aumentar exposición mediante reborrow hasta el leverage objetivo (${targetLeverageForReborrow
            .toFixed(1)
            .replace(".", ",")}x).`,
          actions: {
            purchases,
            totalPurchaseValue,
          },
          actionUrl: "/dashboard/rebalance",
        });
      } else {
        // If leverage is very close to minimum, just show a reminder
        recommendations.push({
          type: "leverage_low",
          priority: "medium",
          title: `Leverage en el Límite Inferior (${leverage
            .toFixed(2)
            .replace(".", ",")}x)`,
          description: `Tu leverage está justo en el límite inferior (${leverageMin
            .toFixed(1)
            .replace(
              ".",
              ","
            )}x). Considera aumentar exposición si el mercado lo permite.`,
          actionUrl: "/dashboard/rebalance",
        });
      }
    }

    // Case 3: Leverage HIGH - Need extra contribution as collateral
    if (leverageStatus === "high") {
      const extraContribution = this.calculateExtraContribution(
        currentState,
        leverageMax
      );

      recommendations.push({
        type: "leverage_high",
        priority: "urgent",
        title: `Leverage Alto (${leverage
          .toFixed(2)
          .replace(".", ",")}x) - URGENTE`,
        description: `Tu leverage efectivo está por encima del máximo (${leverageMax
          .toFixed(1)
          .replace(
            ".",
            ","
          )}x). Se recomienda realizar un aporte extra para reducir el leverage.`,
        actions: {
          extraContribution,
        },
        actionUrl: `/dashboard/contribution?extra=true&amount=${Math.ceil(
          extraContribution.amount
        )}`,
      });
    }

    // Sort by priority
    const priorityOrder: Record<RecommendationPriority, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    recommendations.sort(
      (a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]
    );

    return recommendations;
  }

  /**
   * Calculate specific purchases for leverage_low case
   * Increases exposure to reach target leverage (usually leverageTarget, not just minimum)
   */
  private async calculateSpecificPurchases(
    portfolio: any,
    currentState: PortfolioCurrentState,
    targetWeights: Record<string, number>,
    latestPrices: Record<string, number>,
    targetLeverage: number
  ): Promise<PurchaseRecommendation[]> {
    const { equity, exposure } = currentState;

    // Target exposure to reach target leverage
    const targetExposure = equity * targetLeverage;
    const exposureIncrease = targetExposure - exposure;

    // Only recommend purchases if increase is meaningful (at least $10)
    if (exposureIncrease <= 10) {
      return [];
    }

    return this.distributePurchasesByWeight(
      portfolio,
      targetWeights,
      latestPrices,
      exposureIncrease
    );
  }

  /**
   * Calculate purchases for rebalancing with pending contributions
   */
  private async calculateRebalancePurchases(
    portfolio: any,
    currentState: PortfolioCurrentState,
    targetWeights: Record<string, number>,
    latestPrices: Record<string, number>,
    deployFraction: number
  ): Promise<PurchaseRecommendation[]> {
    const { pendingContributions } = currentState;

    // Amount to deploy based on fraction
    const amountToDeploy = pendingContributions * deployFraction;

    // With leverage, exposure increase is larger
    const leverageMultiplier = portfolio.leverageTarget || 3.0;
    const exposureIncrease = amountToDeploy * leverageMultiplier;

    if (exposureIncrease <= 0) {
      return [];
    }

    return this.distributePurchasesByWeight(
      portfolio,
      targetWeights,
      latestPrices,
      exposureIncrease
    );
  }

  /**
   * Distribute purchase amount across assets by target weights
   */
  private async distributePurchasesByWeight(
    portfolio: any,
    targetWeights: Record<string, number>,
    latestPrices: Record<string, number>,
    totalAmount: number
  ): Promise<PurchaseRecommendation[]> {
    const purchases: PurchaseRecommendation[] = [];

    // Get all assets
    const assets = await this.prisma.asset.findMany({
      where: {
        symbol: { in: Object.keys(targetWeights) },
      },
    });

    // Create asset map for quick lookup
    const assetMap = new Map(assets.map((a: any) => [a.symbol, a]));

    for (const [symbol, weight] of Object.entries(targetWeights)) {
      if (weight <= 0) continue;

      const asset = assetMap.get(symbol) as any;
      if (!asset) continue;

      const price = latestPrices[asset.id];
      if (!price || price <= 0) continue;

      const valueUsd = totalAmount * weight;
      const quantity = valueUsd / price;
      const unit = this.getUnitForAsset(asset.symbol, asset.assetType);

      purchases.push({
        assetId: asset.id,
        assetSymbol: symbol,
        assetName: asset.name,
        quantity,
        unit,
        valueUsd,
        targetWeight: weight,
        currentPrice: price,
      });
    }

    return purchases;
  }

  /**
   * Calculate extra contribution needed for leverage_high case
   */
  private calculateExtraContribution(
    currentState: PortfolioCurrentState,
    maxLeverage: number
  ): ExtraContributionRecommendation {
    const { equity, exposure, leverage } = currentState;

    // Target equity to achieve max leverage
    // leverage = exposure / equity
    // maxLeverage = exposure / targetEquity
    // targetEquity = exposure / maxLeverage
    const targetEquity = exposure / maxLeverage;
    const extraNeeded = targetEquity - equity;

    return {
      amount: Math.max(0, extraNeeded),
      currency: "USD",
      reason: `Para reducir leverage de ${leverage
        .toFixed(2)
        .replace(".", ",")}x a ${maxLeverage.toFixed(1).replace(".", ",")}x`,
      currentLeverage: leverage,
      targetLeverage: maxLeverage,
    };
  }

  /**
   * Get leverage status (low, in_range, high)
   * Uses small tolerance to handle floating point precision issues
   */
  private getLeverageStatus(
    leverage: number,
    leverageMin: number,
    leverageMax: number
  ): "low" | "in_range" | "high" {
    const tolerance = 0.01; // 1% tolerance for floating point precision
    if (leverage < leverageMin - tolerance) return "low";
    if (leverage > leverageMax + tolerance) return "high";
    return "in_range";
  }

  /**
   * Get unit for an asset
   */
  private getUnitForAsset(symbol: string, assetType: string): string {
    // Check symbol-specific override first
    if (SYMBOL_UNITS[symbol]) {
      return SYMBOL_UNITS[symbol];
    }

    // Fall back to asset type
    return ASSET_UNITS[assetType] || "units";
  }

  /**
   * Get latest prices for assets
   */
  private async getLatestPrices(
    assetIds: string[]
  ): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};

    for (const assetId of assetIds) {
      const latestPrice = await this.prisma.assetPrice.findFirst({
        where: { assetId },
        orderBy: { date: "desc" },
      });

      if (latestPrice) {
        prices[assetId] = latestPrice.close;
      }
    }

    return prices;
  }
}
