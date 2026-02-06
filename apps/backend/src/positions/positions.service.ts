import { Injectable, NotFoundException } from '@nestjs/common';

import { PortfolioConfigurationService } from '../portfolios/portfolio-configuration.service';
import { PrismaService } from '../prisma/prisma.service';

import { UpsertPositionsDto } from './dto/upsert-positions.dto';

@Injectable()
export class PositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: PortfolioConfigurationService
  ) {}

  async upsert(dto: UpsertPositionsDto) {
    console.log(`[PositionsService] Starting upsert for portfolio ${dto.portfolioId}`);
    console.log(`[PositionsService] Received ${dto.positions.length} positions:`, 
      dto.positions.map(p => ({ symbol: p.symbol, quantity: p.quantity }))
    );

    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: dto.portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
      },
    });

    if (!portfolio) {
      console.error(`[PositionsService] Portfolio not found: ${dto.portfolioId}`);
      throw new NotFoundException('Portfolio not found');
    }

    console.log(`[PositionsService] Portfolio found with ${(portfolio.positions as any[]).length} existing positions`);
    console.log(`[PositionsService] Existing position symbols:`, 
      (portfolio.positions as any[]).map((p: any) => p.asset.symbol)
    );

    const positions = [];
    const newAssets: Array<{ symbol: string; assetId: string; targetWeight?: number }> = [];
    const deletedAssetSymbols: string[] = [];

    // Get current positions to detect new assets and deletions
    const existingPositionSymbols = new Set(
      portfolio.positions.map((p: any) => p.asset.symbol)
    );
    const submittedSymbols = new Set(dto.positions.map((p) => p.symbol));

    console.log(`[PositionsService] Existing position symbols:`, Array.from(existingPositionSymbols));
    console.log(`[PositionsService] Submitted symbols:`, Array.from(submittedSymbols));

    // Detect assets that should be deleted (exist in portfolio but explicitly removed from submitted list)
    // Note: quantity 0 does NOT trigger deletion — assets can exist with 0 quantity
    for (const existingPos of portfolio.positions) {
      const symbol = (existingPos as any).asset.symbol;
      const submittedPos = dto.positions.find((p) => p.symbol === symbol);

      if (!submittedPos) {
        deletedAssetSymbols.push(symbol);
        console.log(`[PositionsService] Marking ${symbol} for deletion (not in submitted positions)`);
      }
    }

    if (deletedAssetSymbols.length > 0) {
      console.log(`[PositionsService] Assets to delete: ${deletedAssetSymbols.join(", ")}`);
    }

    // Update positions
    console.log(`[PositionsService] Processing ${dto.positions.length} positions...`);
    for (const item of dto.positions) {
      // Check if this is a new asset BEFORE skipping quantity 0
      const isNewAsset = !existingPositionSymbols.has(item.symbol);
      console.log(`[PositionsService] Processing position: ${item.symbol}, quantity: ${item.quantity}, isNewAsset: ${isNewAsset}`);
      console.log(`[PositionsService]   - exists in existingPositionSymbols: ${existingPositionSymbols.has(item.symbol)}`);
      console.log(`[PositionsService]   - quantity === 0: ${item.quantity === 0}`);
      
      // Assets with quantity 0 are allowed — they stay in the portfolio for weight configuration
      if (item.quantity === 0) {
        console.log(`[PositionsService] ✅ ${item.symbol} with quantity 0 - will be kept in portfolio`);
      }

      // Auto-fetch price if avgPrice is 0 or not provided
      let finalAvgPrice = item.avgPrice;
      if ((finalAvgPrice === 0 || !finalAvgPrice) && item.quantity > 0) {
        console.log(`[PositionsService] Auto-fetching price for ${item.symbol} (avgPrice is 0)`);
        const fetchedPrice = await this.fetchCurrentPrice(item.symbol);
        if (fetchedPrice) {
          finalAvgPrice = fetchedPrice;
          console.log(`[PositionsService] ✅ Fetched price for ${item.symbol}: $${finalAvgPrice}`);
        } else {
          console.warn(`[PositionsService] ⚠️ Could not fetch price for ${item.symbol}, using 0`);
        }
      }

      const exposure = item.quantity * finalAvgPrice;

      const asset = await this.prisma.asset.upsert({
        where: { symbol: item.symbol },
        update: {
          name: item.symbol,
          assetType: item.source,
        },
        create: {
          symbol: item.symbol,
          name: item.symbol,
          assetType: item.source,
        },
      });

      // Track if this is a new asset for this portfolio
      if (!existingPositionSymbols.has(item.symbol)) {
        console.log(`[PositionsService] New asset detected: ${item.symbol} (assetId: ${asset.id})`);
        
        // Validate ticker by trying to fetch current price
        console.log(`[PositionsService] Validating ticker ${item.symbol}...`);
        const isValidTicker = await this.validateTicker(item.symbol);
        
        if (!isValidTicker) {
          console.error(`[PositionsService] ❌ Ticker validation failed for ${item.symbol}`);
          throw new Error(
            `Ticker inválido: ${item.symbol}. No se encontró información en Yahoo Finance.`
          );
        }

        console.log(`[PositionsService] ✅ Ticker ${item.symbol} validated successfully`);

        newAssets.push({
          symbol: item.symbol,
          assetId: asset.id,
        });

        // Download historical prices for new asset (needed for Sharpe optimization)
        console.log(`[PositionsService] Starting historical price download for new asset ${item.symbol}...`);
        try {
          await this.downloadHistoricalPrices(asset.id, item.symbol);
          console.log(
            `[PositionsService] ✅ Ticker ${item.symbol} validado y histórico descargado correctamente`
          );
        } catch (err) {
          console.error(
            `[PositionsService] ⚠️ Error descargando histórico para ${item.symbol}:`,
            err
          );
          if (err instanceof Error) {
            console.error(`[PositionsService] Error details: ${err.message}`);
            console.error(`[PositionsService] Error stack: ${err.stack}`);
          }
          // Don't fail the entire operation, but log the error
          // The asset will still be added, but without historical data
        }
      }

      // Calculate weighted average price to preserve cost basis
      // Only update avgPrice when quantity increases (buying more)
      // On sells or manual updates, keep existing avgPrice
      const existingPosition = await this.prisma.portfolioPosition.findUnique({
        where: {
          portfolioId_assetId: {
            portfolioId: dto.portfolioId,
            assetId: asset.id,
          },
        },
      });

      let avgPriceForUpdate = finalAvgPrice;
      if (existingPosition && existingPosition.quantity > 0 && item.quantity > existingPosition.quantity && finalAvgPrice > 0) {
        // Buying more: weighted average
        const deltaQty = item.quantity - existingPosition.quantity;
        avgPriceForUpdate =
          (existingPosition.quantity * existingPosition.avgPrice + deltaQty * finalAvgPrice) /
          item.quantity;
      } else if (existingPosition && item.quantity > 0 && item.quantity <= existingPosition.quantity) {
        // Selling or same quantity: keep existing avgPrice
        avgPriceForUpdate = existingPosition.avgPrice;
      }

      const position = await this.prisma.portfolioPosition.upsert({
        where: {
          portfolioId_assetId: {
            portfolioId: dto.portfolioId,
            assetId: asset.id,
          },
        },
        update: {
          quantity: item.quantity,
          avgPrice: avgPriceForUpdate,
          exposureUsd: exposure,
        },
        create: {
          portfolioId: dto.portfolioId,
          assetId: asset.id,
          quantity: item.quantity,
          avgPrice: finalAvgPrice,
          exposureUsd: exposure,
        },
      });

      positions.push(position);
    }

    // Delete positions with quantity 0
    if (deletedAssetSymbols.length > 0) {
      for (const symbol of deletedAssetSymbols) {
        const asset = await this.prisma.asset.findUnique({
          where: { symbol },
        });
        
        if (asset) {
          await this.prisma.portfolioPosition.deleteMany({
            where: {
              portfolioId: dto.portfolioId,
              assetId: asset.id,
            },
          });
        }
      }
    }

    // If new assets were added, update target weights
    if (newAssets.length > 0) {
      await this.updateTargetWeightsForNewAssets(
        dto.portfolioId,
        newAssets.map((a) => a.symbol),
        [] // No provided weights - will be set based on allocation method
      );
    }

    // If assets were deleted, remove them from target weights
    if (deletedAssetSymbols.length > 0) {
      await this.removeTargetWeightsForDeletedAssets(
        dto.portfolioId,
        deletedAssetSymbols
      );
    }

    // Update equity if provided
    if (dto.equity !== undefined && dto.equity !== null) {
      // Calculate current exposure from updated positions
      let exposure = 0;
      const latestPrices: Record<string, number> = {};
      
      for (const position of positions) {
        const latestPrice = await this.prisma.assetPrice.findFirst({
          where: { assetId: position.assetId },
          orderBy: { date: 'desc' },
        });
        const price = latestPrice?.close || position.avgPrice;
        latestPrices[position.assetId] = price;
        exposure += position.quantity * price;
      }

      // Get previous equity to detect changes
      const previousMetrics = await this.prisma.metricsTimeseries.findFirst({
        where: { portfolioId: dto.portfolioId },
        orderBy: { date: 'desc' },
      });
      const previousEquity = previousMetrics?.equity || 0;
      const equityDelta = dto.equity - previousEquity;

      // If equity increased, create an implicit contribution to track the capital injection
      // This prevents manual equity increases from appearing as "returns"
      if (equityDelta > 0) {
        console.log(`[PositionsService] Manual equity increase detected: $${previousEquity.toFixed(2)} → $${dto.equity.toFixed(2)} (delta: +$${equityDelta.toFixed(2)})`);
        console.log(`[PositionsService] Creating implicit contribution of $${equityDelta.toFixed(2)} to track capital injection`);
        
        await this.prisma.monthlyContribution.create({
          data: {
            portfolioId: dto.portfolioId,
            amount: equityDelta,
            contributedAt: new Date(),
            deployed: true,
            note: `Ajuste manual de equity (+$${equityDelta.toFixed(2)})`,
          },
        });
      } else if (equityDelta < 0) {
        // Equity decreased - this could be a withdrawal or loss correction
        // We create a negative contribution to track the capital withdrawal
        console.log(`[PositionsService] Manual equity decrease detected: $${previousEquity.toFixed(2)} → $${dto.equity.toFixed(2)} (delta: $${equityDelta.toFixed(2)})`);
        console.log(`[PositionsService] Creating implicit negative contribution of $${equityDelta.toFixed(2)} to track capital withdrawal`);
        
        await this.prisma.monthlyContribution.create({
          data: {
            portfolioId: dto.portfolioId,
            amount: equityDelta, // Negative value
            contributedAt: new Date(),
            deployed: true,
            note: `Ajuste manual de equity ($${equityDelta.toFixed(2)})`,
          },
        });
      }

      // Calculate borrowed amount: exposure - equity
      const borrowedAmount = exposure - dto.equity;
      
      // Calculate leverage and margin ratio
      const leverage = dto.equity > 0 ? exposure / dto.equity : 0;
      const marginRatio = exposure > 0 ? dto.equity / exposure : 1;

      // Get or calculate peak equity
      const dailyMetricClient = this.prisma.dailyMetric;
      const latestDailyMetric = dailyMetricClient
        ? await dailyMetricClient.findFirst({
            where: { portfolioId: dto.portfolioId },
            orderBy: { date: 'desc' },
          })
        : null;

      const latestMetrics = await this.prisma.metricsTimeseries.findFirst({
        where: { portfolioId: dto.portfolioId },
        orderBy: { date: 'desc' },
      });

      let peakEquity = dto.equity;
      if (latestDailyMetric?.peakEquity) {
        peakEquity = Math.max(latestDailyMetric.peakEquity, dto.equity);
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
        peakEquity = Math.max(peakEquity, dto.equity);
      }

      const drawdown = peakEquity > 0 ? (dto.equity - peakEquity) / peakEquity : 0;

      // Get today's date in UTC to avoid timezone issues
      // Create date at midnight UTC for today
      const now = new Date();
      const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      
      // For MetricsTimeseries, we need to find entries for today
      // Use a date range to find any entry for today (handles timezone differences)
      const todayStart = new Date(today);
      const todayEnd = new Date(today);
      todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);

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
            equity: dto.equity,
            exposure,
            leverage,
            peakEquity,
            marginRatio,
            drawdown,
            borrowedAmount,
          },
          update: {
            equity: dto.equity,
            exposure,
            leverage,
            peakEquity,
            marginRatio,
            drawdown,
            borrowedAmount,
          },
        });
      }

      // IMPORTANT: Also update or create entry in MetricsTimeseries (historical data)
      // This ensures analytics use the most current equity value
      // First try exact date match, then fall back to range query
      let existingMetric = await this.prisma.metricsTimeseries.findFirst({
        where: {
          portfolioId: dto.portfolioId,
          date: today,
        },
      });
      
      // If no exact match, try range query (handles timezone edge cases)
      if (!existingMetric) {
        existingMetric = await this.prisma.metricsTimeseries.findFirst({
          where: {
            portfolioId: dto.portfolioId,
            date: {
              gte: todayStart,
              lt: todayEnd,
            },
          },
          orderBy: {
            date: 'desc',
          },
        });
      }

      // Get positions with asset relation for composition calculation
      const positionsWithAssets = await this.prisma.portfolioPosition.findMany({
        where: { portfolioId: dto.portfolioId },
        include: { asset: true },
      });

      // Calculate current portfolio composition
      const composition = positionsWithAssets.map((pos: any) => {
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

      // Build metadata - add manual update to manualUpdates array, preserve other arrays
      let metadata: any = {
        source: 'manual_update',
        updatedAt: new Date().toISOString(),
        composition,
      };

      if (existingMetric && existingMetric.metadataJson) {
        try {
          const existingMetadata = JSON.parse(existingMetric.metadataJson);
          // Preserve existing arrays
          if (existingMetadata.contributions) {
            metadata.contributions = existingMetadata.contributions;
          }
          if (existingMetadata.rebalances) {
            metadata.rebalances = existingMetadata.rebalances;
          }
          if (existingMetadata.manualUpdates) {
            metadata.manualUpdates = existingMetadata.manualUpdates;
          } else {
            metadata.manualUpdates = [];
          }
          // NOTE: DO NOT preserve source - we want source = "manual_update" for this update
          // This allows metrics-refresh to know the equity was set manually
        } catch (e) {
          // If parsing fails, start fresh
          metadata.manualUpdates = [];
          console.warn(`[PositionsService] Failed to parse existing metadata: ${e}`);
        }
      } else {
        metadata.manualUpdates = [];
      }

      // Add new manual update to the array
      metadata.manualUpdates.push({
        equity: dto.equity,
        exposure,
        leverage,
        composition,
        updatedAt: new Date().toISOString(),
      });

      if (existingMetric) {
        // Update existing entry for today
        // Use the existing date to preserve the original date value
        await this.prisma.metricsTimeseries.update({
          where: { id: existingMetric.id },
          data: {
            equity: dto.equity,
            exposure,
            leverage,
            drawdown,
            marginRatio,
            borrowedAmount,
            metadataJson: JSON.stringify(metadata),
          },
        });
      } else {
        // Create new entry for today using UTC date
        await this.prisma.metricsTimeseries.create({
          data: {
            portfolioId: dto.portfolioId,
            date: today, // UTC date at midnight
            borrowedAmount,
            equity: dto.equity,
            exposure,
            leverage,
            drawdown,
            marginRatio,
            metadataJson: JSON.stringify(metadata),
          },
        });
      }
    }

    console.log(`[PositionsService] Upsert completed. Returning ${positions.length} positions`);
    return positions;
  }

  /**
   * Validate ticker by checking if it exists in Yahoo Finance
   */
  private async validateTicker(symbol: string): Promise<boolean> {
    console.log(`[PositionsService] Validating ticker: ${symbol}`);
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
      console.log(`[PositionsService] Validation URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      console.log(`[PositionsService] Validation response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        console.error(`[PositionsService] Validation failed: HTTP ${response.status} for ${symbol}`);
        return false;
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];
      
      const hasValidData = !!(
        result &&
        (result.meta?.regularMarketPrice !== undefined ||
          result.indicators?.quote?.[0]?.close?.length > 0)
      );

      if (hasValidData) {
        console.log(`[PositionsService] ✅ Ticker ${symbol} is valid`, {
          hasMetaPrice: !!result.meta?.regularMarketPrice,
          hasQuoteData: !!result.indicators?.quote?.[0]?.close?.length,
          currentPrice: result.meta?.regularMarketPrice || 'N/A'
        });
      } else {
        console.error(`[PositionsService] ❌ Ticker ${symbol} validation failed - no valid data`, {
          hasResult: !!result,
          hasMeta: !!result?.meta,
          hasIndicators: !!result?.indicators,
          responsePreview: JSON.stringify(data).substring(0, 200)
        });
      }

      return hasValidData;
    } catch (error) {
      console.error(`[PositionsService] Error validating ticker ${symbol}:`, error);
      if (error instanceof Error) {
        console.error(`[PositionsService] Error details: ${error.message}`);
      }
      return false;
    }
  }

  /**
   * Fetch current price from Yahoo Finance
   * @param symbol - Asset symbol
   * @returns Current price or null if not found
   */
  private async fetchCurrentPrice(symbol: string): Promise<number | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.error(`[PositionsService] Failed to fetch price for ${symbol}: HTTP ${response.status}`);
        return null;
      }

      const data = await response.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;

      if (price && price > 0) {
        return price;
      }

      return null;
    } catch (error) {
      console.error(`[PositionsService] Error fetching current price for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Download historical prices for an asset (needed for Sharpe optimization)
   * Downloads last 730 days (24+ months) of daily prices for robust Sharpe calculation
   */
  private async downloadHistoricalPrices(
    assetId: string,
    symbol: string
  ): Promise<void> {
    console.log(`[PositionsService] Starting historical price download for ${symbol} (assetId: ${assetId})`);
    
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 730); // 24+ months of data for Sharpe optimization

      const startTs = Math.floor(startDate.getTime() / 1000);
      const endTs = Math.floor(endDate.getTime() / 1000);

      console.log(`[PositionsService] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;
      console.log(`[PositionsService] Fetching from URL: ${url}`);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      console.log(`[PositionsService] Response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        console.error(`[PositionsService] HTTP error for ${symbol}: ${response.status} - ${errorText}`);
        throw new Error(`Failed to fetch historical data for ${symbol}: HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log(`[PositionsService] Response received, parsing data for ${symbol}`);
      
      const result = data.chart?.result?.[0];

      if (!result) {
        console.error(`[PositionsService] No result in response for ${symbol}. Response structure:`, JSON.stringify(data).substring(0, 500));
        throw new Error(`No data returned for ${symbol} - chart.result[0] is missing`);
      }

      if (!result.timestamp || !result.indicators) {
        console.error(`[PositionsService] Missing timestamp or indicators for ${symbol}. Result structure:`, {
          hasTimestamp: !!result.timestamp,
          hasIndicators: !!result.indicators,
          timestampLength: result.timestamp?.length,
          indicatorsKeys: result.indicators ? Object.keys(result.indicators) : []
        });
        throw new Error(`No data returned for ${symbol} - missing timestamp or indicators`);
      }

      const timestamps = result.timestamp;
      const adjCloses = result.indicators.adjclose?.[0]?.adjclose;
      const closes = result.indicators.quote?.[0]?.close;
      const priceArray = adjCloses || closes;

      console.log(`[PositionsService] Data parsed for ${symbol}:`, {
        timestampsCount: timestamps?.length || 0,
        hasAdjCloses: !!adjCloses,
        adjClosesCount: adjCloses?.length || 0,
        hasCloses: !!closes,
        closesCount: closes?.length || 0,
        usingPriceArray: adjCloses ? 'adjCloses' : 'closes',
        priceArrayLength: priceArray?.length || 0
      });

      if (!priceArray || priceArray.length === 0) {
        console.error(`[PositionsService] No price data available for ${symbol}`);
        throw new Error(`No price data for ${symbol}`);
      }

      // Store prices in database
      let savedCount = 0;
      let skippedCount = 0;
      let firstDate: Date | null = null;
      let lastDate: Date | null = null;

      console.log(`[PositionsService] Starting to save ${priceArray.length} price points to database for ${symbol}`);

      for (let i = 0; i < timestamps.length; i++) {
        const price = priceArray[i];
        if (price !== null && price !== undefined && price > 0) {
          const date = new Date(timestamps[i] * 1000);
          date.setUTCHours(0, 0, 0, 0);

          if (!firstDate) firstDate = date;
          lastDate = date;

          try {
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
          } catch (dbError) {
            console.error(`[PositionsService] Error saving price for ${symbol} on ${date.toISOString()}:`, dbError);
            throw dbError;
          }
        } else {
          skippedCount++;
        }
      }

      console.log(`[PositionsService] ✅ Successfully downloaded and saved historical prices for ${symbol}:`, {
        totalDataPoints: timestamps.length,
        savedCount,
        skippedCount,
        firstDate: firstDate?.toISOString(),
        lastDate: lastDate?.toISOString(),
        dateRange: firstDate && lastDate ? `${Math.round((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24))} days` : 'N/A'
      });

      // Verify what was actually saved
      const savedPrices = await this.prisma.assetPrice.findMany({
        where: { assetId },
        orderBy: { date: 'asc' },
        select: { date: true, close: true },
      });

      console.log(`[PositionsService] Verification: Found ${savedPrices.length} prices in database for ${symbol}`, {
        firstSavedDate: savedPrices[0]?.date.toISOString(),
        lastSavedDate: savedPrices[savedPrices.length - 1]?.date.toISOString(),
        samplePrices: savedPrices.slice(0, 3).map((p: any) => ({ date: p.date.toISOString(), price: p.close }))
      });

    } catch (error) {
      console.error(
        `[PositionsService] ❌ Error downloading historical prices for ${symbol} (assetId: ${assetId}):`,
        error
      );
      if (error instanceof Error) {
        console.error(`[PositionsService] Error message: ${error.message}`);
        console.error(`[PositionsService] Error stack: ${error.stack}`);
      }
      throw error;
    }
  }

  /**
   * Update target weights when new assets are added
   * - If user provided targetWeight: use it
   * - If using Sharpe optimization: Add with equal weight distribution
   * - If using manual weights: Add with provided weight or 0
   */
  private async updateTargetWeightsForNewAssets(
    portfolioId: string,
    newAssetSymbols: string[],
    providedWeights: Array<{ symbol: string; weight?: number }>
  ): Promise<void> {
    try {
      const config = await this.configService.getConfiguration(portfolioId);
      const currentWeights = config.targetWeights;
      const useSharpe = config.useDynamicSharpeRebalance;

      // Get all current position symbols
      const portfolio = await this.prisma.portfolio.findUnique({
        where: { id: portfolioId },
        include: {
          positions: {
            include: { asset: true },
          },
        },
      });

      if (!portfolio) return;

      const allSymbols = portfolio.positions.map(
        (p: any) => p.asset.symbol
      );

      // Update weights
      const updatedWeights: Record<string, number> = { ...currentWeights };

      // First, add provided weights
      for (const { symbol, weight } of providedWeights) {
        if (weight !== undefined && weight !== null) {
          updatedWeights[symbol] = weight;
        }
      }

      if (useSharpe) {
        // If using Sharpe: distribute remaining weight equally among all assets
        const existingWeightSum = Object.values(updatedWeights).reduce(
          (a, b) => a + b,
          0
        );
        const remainingWeight = Math.max(0, 1 - existingWeightSum);
        const assetsWithoutWeight = allSymbols.filter(
          (s: string) => !(s in updatedWeights) || updatedWeights[s] === 0
        );

        if (assetsWithoutWeight.length > 0 && remainingWeight > 0) {
          const equalWeight = remainingWeight / assetsWithoutWeight.length;
          for (const symbol of assetsWithoutWeight) {
            updatedWeights[symbol] = equalWeight;
          }
        }

        // Normalize to ensure sum = 1
        const sum = Object.values(updatedWeights).reduce((a, b) => a + b, 0);
        if (sum > 0 && Math.abs(sum - 1) > 0.001) {
          for (const symbol in updatedWeights) {
            updatedWeights[symbol] /= sum;
          }
        }
      } else {
        // If using manual: add new assets with weight 0 (user must set in configuration)
        for (const symbol of newAssetSymbols) {
          if (!(symbol in updatedWeights)) {
            updatedWeights[symbol] = 0;
          }
        }
      }

      // Update configuration
      await this.configService.updateConfiguration(portfolioId, {
        targetWeights: updatedWeights,
      });
    } catch (error) {
      // Don't fail the position update if weight update fails
      console.error(
        `Failed to update target weights for new assets:`,
        error
      );
    }
  }

  /**
   * Remove target weights for deleted assets and normalize remaining weights
   */
  private async removeTargetWeightsForDeletedAssets(
    portfolioId: string,
    deletedAssetSymbols: string[]
  ): Promise<void> {
    try {
      const portfolio = await this.prisma.portfolio.findUnique({
        where: { id: portfolioId },
      });

      if (!portfolio) return;

      const currentWeights = portfolio.targetWeightsJson
        ? JSON.parse(portfolio.targetWeightsJson)
        : {};

      // Remove deleted assets from weights
      for (const symbol of deletedAssetSymbols) {
        delete currentWeights[symbol];
      }

      // Normalize remaining weights to sum to 1
      const totalWeight = Object.values(currentWeights).reduce(
        (sum: number, w: any) => sum + (w || 0),
        0
      );

      if (totalWeight > 0) {
        for (const symbol in currentWeights) {
          currentWeights[symbol] = currentWeights[symbol] / totalWeight;
        }
      }

      // Persist updated weights
      await this.prisma.portfolio.update({
        where: { id: portfolioId },
        data: {
          targetWeightsJson: JSON.stringify(currentWeights),
        },
      });

      console.log(
        `[PositionsService] Removed target weights for deleted assets: ${deletedAssetSymbols.join(", ")}`
      );
    } catch (error) {
      console.error(
        `[PositionsService] Error removing target weights for deleted assets:`,
        error
      );
    }
  }

  /**
   * Search for symbols in Yahoo Finance
   * Returns ticker, name, and current price
   */
  async searchSymbols(query: string): Promise<
    Array<{
      symbol: string;
      name: string;
      price: number | null;
      exchange: string;
    }>
  > {
    if (!query || query.length < 1) {
      return [];
    }

    try {
      // Yahoo Finance search API
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
      
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const quotes = data.quotes || [];

      return quotes.slice(0, 10).map((quote: any) => ({
        symbol: quote.symbol,
        name: quote.longname || quote.shortname || quote.symbol,
        price: null,
        exchange: quote.exchange || "",
      }));
    } catch (error) {
      console.error("Error searching symbols:", error);
      return [];
    }
  }
}

