import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import {
  RISK_PROFILES,
  isValidRiskProfileId,
} from "../shared";

import {
  CreatePortfolioDto,
  CreatePortfolioResponse,
} from "./dto/create-portfolio.dto";

/**
 * Progress callback type for SSE events
 */
export interface OnboardingProgress {
  type: "step" | "asset" | "complete" | "error";
  step?: string;
  current?: number;
  total?: number;
  asset?: string;
  message?: string;
}

/**
 * Service for onboarding new users and creating portfolios
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new portfolio with assets and weights
   * @param userId - User ID
   * @param dto - Portfolio creation data
   * @param progressCallback - Optional callback to report progress (for SSE)
   * @returns Created portfolio with assets and weights
   */
  async createPortfolioWithAssets(
    userId: string,
    dto: CreatePortfolioDto,
    progressCallback?: (progress: OnboardingProgress) => void
  ): Promise<CreatePortfolioResponse> {
    console.log(
      `[OnboardingService] Creating portfolio for user ${userId} with ${dto.assets.length} assets`
    );

    const warnings: string[] = [];

    // Validate that user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Validate assets array is not empty
    if (!dto.assets || dto.assets.length === 0) {
      throw new BadRequestException(
        "At least one asset is required to create a portfolio"
      );
    }

    // Validate manual weights if provided
    if (dto.weightAllocationMethod === "manual") {
      if (!dto.targetWeights) {
        throw new BadRequestException(
          "Target weights are required for manual allocation"
        );
      }
      this.validateTargetWeights(dto.targetWeights, dto.assets.map((a) => a.symbol));
    }

    // Step 1: Validate and create/get assets
    console.log(`[OnboardingService] Step 1: Validating and creating assets...`);
    if (progressCallback) {
      progressCallback({
        type: "step",
        step: "validating_assets",
        message: "Validando activos...",
      });
    }
    const assetMap: Record<string, string> = {}; // symbol -> assetId

    for (let i = 0; i < dto.assets.length; i++) {
      const assetDto = dto.assets[i];
      console.log(`[OnboardingService] Processing asset: ${assetDto.symbol}`);

      // Check if asset exists
      let asset = await this.prisma.asset.findUnique({
        where: { symbol: assetDto.symbol },
      });

      if (!asset) {
        // Validate ticker exists in Yahoo Finance
        const isValid = await this.validateTicker(assetDto.symbol);
        if (!isValid) {
          throw new BadRequestException(
            `Invalid ticker: ${assetDto.symbol}. Not found in Yahoo Finance.`
          );
        }

        // Create asset
        asset = await this.prisma.asset.create({
          data: {
            symbol: assetDto.symbol,
            name: assetDto.name || assetDto.symbol,
            assetType: assetDto.assetType || "unknown",
          },
        });
        console.log(`[OnboardingService] ✅ Created asset: ${asset.symbol}`);
      } else {
        console.log(`[OnboardingService] ℹ️  Asset exists: ${asset.symbol}`);
      }

      assetMap[assetDto.symbol] = asset.id;
      
      if (progressCallback) {
        progressCallback({
          type: "asset",
          current: i + 1,
          total: dto.assets.length,
          asset: assetDto.symbol,
          message: `Validado: ${assetDto.symbol}`,
        });
      }
    }

    // Step 2: Download historical prices for all assets (24+ months)
    console.log(
      `[OnboardingService] Step 2: Downloading historical prices (24+ months)...`
    );
    if (progressCallback) {
      progressCallback({
        type: "step",
        step: "downloading_history",
        message: "Descargando histórico de precios (24+ meses)...",
        current: 0,
        total: dto.assets.length,
      });
    }
    let historicalDataDownloaded = true;

    for (let i = 0; i < dto.assets.length; i++) {
      const assetDto = dto.assets[i];
      const assetId = assetMap[assetDto.symbol];
      
      if (progressCallback) {
        progressCallback({
          type: "asset",
          current: i + 1,
          total: dto.assets.length,
          asset: assetDto.symbol,
          message: `Descargando ${assetDto.symbol}... (${i + 1}/${dto.assets.length})`,
        });
      }
      
      try {
        // Skip download if asset already covers the required date range
        const requiredStart = new Date();
        requiredStart.setDate(requiredStart.getDate() - 730);
        requiredStart.setUTCHours(0, 0, 0, 0);
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        const oldestPrice = await this.prisma.assetPrice.findFirst({
          where: { assetId },
          orderBy: { date: "asc" },
          select: { date: true },
        });
        const newestPrice = await this.prisma.assetPrice.findFirst({
          where: { assetId },
          orderBy: { date: "desc" },
          select: { date: true },
        });

        // Allow 5-day tolerance on both ends to account for weekends and holidays
        const toleranceMs = 5 * 24 * 60 * 60 * 1000;
        const hasFullRange =
          oldestPrice &&
          newestPrice &&
          oldestPrice.date.getTime() <= requiredStart.getTime() + toleranceMs &&
          newestPrice.date.getTime() >= today.getTime() - toleranceMs;

        if (hasFullRange) {
          console.log(
            `[OnboardingService] ℹ️  Skipping download for ${assetDto.symbol} (history covers ${oldestPrice.date.toISOString().split("T")[0]} to ${newestPrice.date.toISOString().split("T")[0]})`
          );
        } else {
          await this.downloadHistoricalPrices(assetId, assetDto.symbol);
          console.log(
            `[OnboardingService] ✅ Downloaded history for ${assetDto.symbol}`
          );
        }
        if (progressCallback) {
          progressCallback({
            type: "asset",
            current: i + 1,
            total: dto.assets.length,
            asset: assetDto.symbol,
            message: `✅ ${assetDto.symbol} completado (${i + 1}/${dto.assets.length})`,
          });
        }
      } catch (error) {
        console.error(
          `[OnboardingService] ⚠️ Failed to download history for ${assetDto.symbol}:`,
          error
        );
        warnings.push(
          `Could not download historical data for ${assetDto.symbol}. Sharpe optimization may be limited.`
        );
        historicalDataDownloaded = false;
        if (progressCallback) {
          progressCallback({
            type: "asset",
            current: i + 1,
            total: dto.assets.length,
            asset: assetDto.symbol,
            message: `⚠️ Error descargando ${assetDto.symbol}`,
          });
        }
      }
    }

    // Step 3: Calculate weights
    console.log(
      `[OnboardingService] Step 3: Calculating weights (method: ${dto.weightAllocationMethod})...`
    );
    if (progressCallback) {
      progressCallback({
        type: "step",
        step: "calculating_weights",
        message: "Calculando pesos...",
      });
    }
    const weights = this.calculateWeights(
      dto.assets.map((a) => a.symbol),
      dto.weightAllocationMethod,
      dto.targetWeights
    );

    // Step 4: Create portfolio
    console.log(`[OnboardingService] Step 4: Creating portfolio...`);
    if (progressCallback) {
      progressCallback({
        type: "step",
        step: "creating_portfolio",
        message: "Creando portfolio...",
      });
    }
    // Determine leverage params: use risk profile if provided, otherwise use dto values or defaults
    let leverageMin = dto.leverageMin ?? 2.5;
    let leverageMax = dto.leverageMax ?? 4.0;
    let leverageTarget = dto.leverageTarget ?? 3.0;
    let riskProfile = dto.riskProfile || null;

    if (dto.riskProfile && isValidRiskProfileId(dto.riskProfile)) {
      const profileParams = RISK_PROFILES[dto.riskProfile].params;
      leverageMin = profileParams.leverageMin;
      leverageMax = profileParams.leverageMax;
      leverageTarget = profileParams.leverageTarget;
      riskProfile = dto.riskProfile;
    }

    const portfolio = await this.prisma.portfolio.create({
      data: {
        userId,
        name: dto.name,
        initialCapital: dto.initialCapital,
        baseCurrency: dto.baseCurrency || "USD",
        leverageMin,
        leverageMax,
        leverageTarget,
        riskProfile,
        monthlyContribution: dto.monthlyContribution,
        contributionFrequency: dto.contributionFrequency || "monthly",
        contributionDayOfMonth: dto.contributionDayOfMonth ?? 1,
        contributionEnabled: dto.contributionEnabled ?? true,
        targetWeightsJson: JSON.stringify(weights.target),
        equalWeightsJson: JSON.stringify(weights.equal),
        useDynamicSharpeRebalance: dto.weightAllocationMethod === "sharpe",
      },
    });

    console.log(`[OnboardingService] ✅ Portfolio created: ${portfolio.id}`);

    // Step 5: Create initial positions with 0 quantity (just to link assets to portfolio)
    console.log(`[OnboardingService] Step 5: Creating initial positions...`);
    for (const assetDto of dto.assets) {
      const assetId = assetMap[assetDto.symbol];
      await this.prisma.portfolioPosition.create({
        data: {
          portfolioId: portfolio.id,
          assetId,
          quantity: 0,
          avgPrice: 0,
          exposureUsd: 0,
        },
      });
    }

    // Step 5b: Create target assets (the new model for "what user wants to hold")
    console.log(`[OnboardingService] Step 5b: Creating target assets...`);
    for (const assetDto of dto.assets) {
      const assetId = assetMap[assetDto.symbol];
      const targetWeight = weights.target[assetDto.symbol] || (1 / dto.assets.length);
      await this.prisma.portfolioTargetAsset.create({
        data: {
          portfolioId: portfolio.id,
          assetId,
          targetWeight,
          enabled: true,
        },
      });
    }

    // Step 6: Create initial metrics entry
    console.log(`[OnboardingService] Step 6: Creating initial metrics...`);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Calculate initial composition based on target weights
    const composition = dto.assets.map((asset) => {
      const targetWeight = weights.target[asset.symbol] || 0;
      return {
        symbol: asset.symbol,
        name: asset.name || asset.symbol,
        weight: targetWeight,
        value: 0, // No exposure yet at onboarding
        quantity: 0, // No positions yet at onboarding
      };
    });

    await this.prisma.metricsTimeseries.create({
      data: {
        portfolioId: portfolio.id,
        date: today,
        equity: dto.initialCapital,
        exposure: 0,
        leverage: 0,
        borrowedAmount: 0,
        marginRatio: 1,
        metadataJson: JSON.stringify({
          source: "onboarding",
          composition,
          createdAt: new Date().toISOString(),
        }),
      },
    });

    // Create daily metric entry too
    const dailyMetricClient = this.prisma.dailyMetric;
    if (dailyMetricClient) {
      await dailyMetricClient.create({
        data: {
          portfolioId: portfolio.id,
          date: today,
          equity: dto.initialCapital,
          exposure: 0,
          leverage: 0,
          peakEquity: dto.initialCapital,
          borrowedAmount: 0,
          marginRatio: 1,
        },
      });
    }

    console.log(
      `[OnboardingService] ✅ Onboarding complete for portfolio ${portfolio.id}`
    );

    if (progressCallback) {
      progressCallback({
        type: "complete",
        message: "¡Portfolio creado exitosamente!",
      });
    }

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        initialCapital: portfolio.initialCapital,
        baseCurrency: portfolio.baseCurrency,
      },
      assetsCreated: dto.assets.length,
      historicalDataDownloaded,
      targetWeights: weights.target,
      equalWeights: weights.equal,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Check if user has any portfolios
   * @param userId - User ID
   * @returns true if user has at least one portfolio
   */
  async userHasPortfolio(userId: string): Promise<boolean> {
    const count = await this.prisma.portfolio.count({
      where: { userId },
    });
    return count > 0;
  }

  /**
   * Calculate weights based on allocation method
   */
  private calculateWeights(
    symbols: string[],
    method: "sharpe" | "manual" | "equal",
    manualWeights?: Record<string, number>
  ): { target: Record<string, number>; equal: Record<string, number> } {
    const n = symbols.length;
    const equalWeight = 1 / n;

    // Calculate equal weights
    const equalWeights: Record<string, number> = {};
    for (const symbol of symbols) {
      equalWeights[symbol] = equalWeight;
    }

    // Determine target weights based on method
    let targetWeights: Record<string, number>;

    switch (method) {
      case "manual":
        if (!manualWeights) {
          throw new BadRequestException(
            "Manual weights required for manual allocation method"
          );
        }
        targetWeights = manualWeights;
        break;

      case "sharpe":
        // For Sharpe, use equal weights initially
        // The actual optimization happens during rebalancing
        targetWeights = { ...equalWeights };
        break;

      case "equal":
      default:
        targetWeights = { ...equalWeights };
        break;
    }

    return {
      target: targetWeights,
      equal: equalWeights,
    };
  }

  /**
   * Validate target weights
   */
  private validateTargetWeights(
    weights: Record<string, number>,
    symbols: string[]
  ): void {
    // Check all symbols have weights
    for (const symbol of symbols) {
      if (!(symbol in weights)) {
        throw new BadRequestException(
          `Missing weight for asset: ${symbol}`
        );
      }
    }

    // Check weights are valid numbers between 0 and 1
    let sum = 0;
    for (const [symbol, weight] of Object.entries(weights)) {
      if (typeof weight !== "number" || isNaN(weight)) {
        throw new BadRequestException(
          `Invalid weight for ${symbol}: must be a number`
        );
      }
      if (weight < 0 || weight > 1) {
        throw new BadRequestException(
          `Invalid weight for ${symbol}: must be between 0 and 1`
        );
      }
      sum += weight;
    }

    // Check weights sum to 1 (with tolerance)
    if (Math.abs(sum - 1) > 0.01) {
      throw new BadRequestException(
        `Target weights must sum to 100%. Current sum: ${(sum * 100).toFixed(1)}%`
      );
    }
  }

  /**
   * Validate ticker exists in Yahoo Finance
   */
  private async validateTicker(symbol: string): Promise<boolean> {
    console.log(`[OnboardingService] Validating ticker: ${symbol}`);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.error(
          `[OnboardingService] Ticker validation failed for ${symbol}: HTTP ${response.status}`
        );
        return false;
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      const isValid = !!(
        result &&
        (result.meta?.regularMarketPrice !== undefined ||
          result.indicators?.quote?.[0]?.close?.length > 0)
      );

      console.log(
        `[OnboardingService] Ticker ${symbol} validation: ${isValid ? "✅ valid" : "❌ invalid"}`
      );
      return isValid;
    } catch (error) {
      console.error(
        `[OnboardingService] Error validating ticker ${symbol}:`,
        error
      );
      return false;
    }
  }

  /**
   * Download historical prices for an asset (24+ months for Sharpe)
   */
  private async downloadHistoricalPrices(
    assetId: string,
    symbol: string
  ): Promise<void> {
    console.log(
      `[OnboardingService] Downloading historical prices for ${symbol}...`
    );

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 730); // 24+ months

    const startTs = Math.floor(startDate.getTime() / 1000);
    const endTs = Math.floor(endDate.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch historical data for ${symbol}: HTTP ${response.status}`
      );
    }

    const data = await response.json();
    const result = data.chart?.result?.[0];

    if (!result || !result.timestamp || !result.indicators) {
      throw new Error(`No historical data available for ${symbol}`);
    }

    const timestamps = result.timestamp;
    const adjCloses = result.indicators.adjclose?.[0]?.adjclose;
    const closes = result.indicators.quote?.[0]?.close;
    const priceArray = adjCloses || closes;

    if (!priceArray || priceArray.length === 0) {
      throw new Error(`No price data for ${symbol}`);
    }

    // Store prices in database
    let savedCount = 0;

    for (let i = 0; i < timestamps.length; i++) {
      const price = priceArray[i];
      if (price !== null && price !== undefined && price > 0) {
        const date = new Date(timestamps[i] * 1000);
        date.setUTCHours(0, 0, 0, 0);

        await this.prisma.assetPrice.upsert({
          where: {
            assetId_date: {
              assetId,
              date,
            },
          },
          create: {
            assetId,
            date,
            close: price,
            adjClose: adjCloses?.[i] || price,
            source: "yahoo_finance",
          },
          update: {
            close: price,
            adjClose: adjCloses?.[i] || price,
          },
        });
        savedCount++;
      }
    }

    console.log(
      `[OnboardingService] ✅ Saved ${savedCount} price records for ${symbol}`
    );
  }
}

