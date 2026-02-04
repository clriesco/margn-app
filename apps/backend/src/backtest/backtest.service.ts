import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BacktestService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get historical prices for symbols, using DB cache with Yahoo gap-fill
   */
  async getPrices(
    symbols: string[],
    from: string,
    to: string
  ): Promise<{ prices: Record<string, Record<string, number>>; earliestCommonDate: string }> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const result: Record<string, Record<string, number>> = {};
    const firstDates: Date[] = [];

    for (const symbol of symbols) {
      // Find or create asset
      let asset = await this.prisma.asset.findUnique({ where: { symbol } });
      if (!asset) {
        asset = await this.prisma.asset.create({
          data: {
            symbol,
            name: symbol,
            assetType: this.guessAssetType(symbol),
          },
        });
      }

      // Get cached prices for the requested range
      const cached = await this.prisma.assetPrice.findMany({
        where: {
          assetId: asset.id,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: 'asc' },
      });

      const needsDownload = this.checkNeedsDownload(
        cached,
        fromDate,
        toDate,
        asset.earliestKnownDate
      );

      if (needsDownload) {
        const earliestFromYahoo = await this.downloadAndCachePrices(
          asset.id,
          symbol,
          fromDate,
          toDate
        );

        // Update earliestKnownDate if we got data and it's earlier than what we knew
        if (earliestFromYahoo) {
          const shouldUpdate =
            !asset.earliestKnownDate ||
            earliestFromYahoo.getTime() < asset.earliestKnownDate.getTime();

          if (shouldUpdate) {
            await this.prisma.asset.update({
              where: { id: asset.id },
              data: { earliestKnownDate: earliestFromYahoo },
            });
          }
        }

        // Re-fetch from DB after download
        const refreshed = await this.prisma.assetPrice.findMany({
          where: {
            assetId: asset.id,
            date: { gte: fromDate, lte: toDate },
          },
          orderBy: { date: 'asc' },
        });

        result[symbol] = this.toDateMap(refreshed);
        if (refreshed.length > 0) {
          firstDates.push(refreshed[0].date);
        }
      } else {
        result[symbol] = this.toDateMap(cached);
        if (cached.length > 0) {
          firstDates.push(cached[0].date);
        }
      }

      // Rate limit between symbols
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await this.delay(500);
      }
    }

    // Earliest common date is the latest of all first-available dates
    const earliestCommonDate =
      firstDates.length > 0
        ? new Date(Math.max(...firstDates.map((d) => d.getTime())))
            .toISOString()
            .split('T')[0]
        : from;

    return { prices: result, earliestCommonDate };
  }

  /**
   * Determine if we need to download data from Yahoo
   */
  private checkNeedsDownload(
    cached: { date: Date }[],
    fromDate: Date,
    toDate: Date,
    earliestKnownDate: Date | null
  ): boolean {
    const TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days for weekends/holidays

    // No cached data at all
    if (cached.length === 0) {
      return true;
    }

    const firstCachedDate = cached[0].date;
    const lastCachedDate = cached[cached.length - 1].date;

    // Check if we're missing data at the END of the range
    if (lastCachedDate.getTime() < toDate.getTime() - TOLERANCE_MS) {
      return true;
    }

    // Check if we're missing data at the START of the range
    if (firstCachedDate.getTime() > fromDate.getTime() + TOLERANCE_MS) {
      // We might be missing data at the start, but only if:
      // 1. We don't know the earliest available date yet (need to try download)
      // 2. OR the earliest known date is earlier than our first cached date (we have a gap)
      if (!earliestKnownDate) {
        // Don't know earliest date yet - need to try downloading
        return true;
      }

      // If our first cached date is close to the earliest known date,
      // there's no point downloading - Yahoo doesn't have older data
      if (firstCachedDate.getTime() <= earliestKnownDate.getTime() + TOLERANCE_MS) {
        return false;
      }

      // Our first cached date is significantly after earliest known - we're missing data
      return true;
    }

    return false;
  }

  /**
   * Download prices from Yahoo and cache them
   * Returns the earliest date received from Yahoo (or null if download failed)
   */
  private async downloadAndCachePrices(
    assetId: string,
    symbol: string,
    from: Date,
    to: Date
  ): Promise<Date | null> {
    const startTs = Math.floor(from.getTime() / 1000);
    const endTs = Math.floor(to.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(
        `[BacktestService] Failed to fetch ${symbol}: HTTP ${response.status}`
      );
      return null;
    }

    const data = await response.json();
    const chartResult = data.chart?.result?.[0];
    if (!chartResult?.timestamp) return null;

    const timestamps = chartResult.timestamp;
    const adjCloses = chartResult.indicators?.adjclose?.[0]?.adjclose;
    const closes = chartResult.indicators?.quote?.[0]?.close;
    const priceArray = adjCloses || closes;

    if (!priceArray || timestamps.length === 0) return null;

    let earliestDate: Date | null = null;

    for (let i = 0; i < timestamps.length; i++) {
      const price = priceArray[i];
      if (price == null || price <= 0) continue;

      const date = new Date(timestamps[i] * 1000);
      date.setUTCHours(0, 0, 0, 0);

      // Track earliest date from Yahoo
      if (!earliestDate || date.getTime() < earliestDate.getTime()) {
        earliestDate = date;
      }

      try {
        await this.prisma.assetPrice.upsert({
          where: { assetId_date: { assetId, date } },
          create: {
            assetId,
            date,
            close: price,
            adjClose: adjCloses ? price : null,
            source: 'yfinance',
          },
          update: { close: price, adjClose: adjCloses ? price : null },
        });
      } catch {
        // Skip duplicates or constraint errors
      }
    }

    return earliestDate;
  }

  private toDateMap(
    prices: { date: Date; close: number }[]
  ): Record<string, number> {
    const map: Record<string, number> = {};
    for (const p of prices) {
      const dateStr = p.date.toISOString().split('T')[0];
      map[dateStr] = p.close;
    }
    return map;
  }

  private guessAssetType(symbol: string): string {
    if (symbol.includes('-USD')) return 'crypto';
    if (['GLD', 'SLV', 'USO'].includes(symbol)) return 'commodity';
    if (['TLT', 'IEF', 'SHY', 'AGG', 'BND'].includes(symbol)) return 'bond';
    return 'index';
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
