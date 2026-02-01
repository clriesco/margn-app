import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface PricePoint {
  date: string;
  close: number;
}

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

      // Get cached prices
      const cached = await this.prisma.assetPrice.findMany({
        where: {
          assetId: asset.id,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: 'asc' },
      });

      // Check for gaps - do we have data for the full range?
      // Use tolerance: last cached date within 5 days of toDate is fine (weekends/holidays)
      // and first cached date within 5 days of fromDate
      const TOLERANCE_MS = 5 * 24 * 60 * 60 * 1000;
      const needsDownload = cached.length === 0 ||
        cached[0].date.getTime() > fromDate.getTime() + TOLERANCE_MS ||
        cached[cached.length - 1].date.getTime() < toDate.getTime() - TOLERANCE_MS ||
        this.hasGaps(cached);

      if (needsDownload) {
        await this.downloadAndCachePrices(asset.id, symbol, fromDate, toDate);

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
        firstDates.push(cached[0].date);
      }

      // Rate limit between symbols
      if (symbols.indexOf(symbol) < symbols.length - 1) {
        await this.delay(500);
      }
    }

    // Earliest common date is the latest of all first-available dates
    const earliestCommonDate = firstDates.length > 0
      ? new Date(Math.max(...firstDates.map(d => d.getTime())))
          .toISOString().split('T')[0]
      : from;

    return { prices: result, earliestCommonDate };
  }

  private async downloadAndCachePrices(
    assetId: string,
    symbol: string,
    from: Date,
    to: Date
  ): Promise<void> {
    const startTs = Math.floor(from.getTime() / 1000);
    const endTs = Math.floor(to.getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?period1=${startTs}&period2=${endTs}&interval=1d`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      console.error(`[BacktestService] Failed to fetch ${symbol}: HTTP ${response.status}`);
      return;
    }

    const data = await response.json();
    const chartResult = data.chart?.result?.[0];
    if (!chartResult?.timestamp) return;

    const timestamps = chartResult.timestamp;
    const adjCloses = chartResult.indicators?.adjclose?.[0]?.adjclose;
    const closes = chartResult.indicators?.quote?.[0]?.close;
    const priceArray = adjCloses || closes;

    if (!priceArray) return;

    for (let i = 0; i < timestamps.length; i++) {
      const price = priceArray[i];
      if (price == null || price <= 0) continue;

      const date = new Date(timestamps[i] * 1000);
      date.setUTCHours(0, 0, 0, 0);

      try {
        await this.prisma.assetPrice.upsert({
          where: { assetId_date: { assetId, date } },
          create: { assetId, date, close: price, adjClose: adjCloses ? price : null, source: 'yfinance' },
          update: { close: price, adjClose: adjCloses ? price : null },
        });
      } catch {
        // Skip duplicates or constraint errors
      }
    }
  }

  private hasGaps(prices: { date: Date }[]): boolean {
    if (prices.length < 2) return false;
    for (let i = 1; i < prices.length; i++) {
      const diff = (prices[i].date.getTime() - prices[i - 1].date.getTime()) / (1000 * 60 * 60 * 24);
      // More than 8 calendar days gap (accounts for weekends + long holidays like Thanksgiving, Christmas)
      if (diff > 8) return true;
    }
    return false;
  }

  private toDateMap(prices: { date: Date; close: number }[]): Record<string, number> {
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
