import { Injectable, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

interface DailyHistoryEntry {
  date: string;
  equity: number;
  exposure: number;
}

const RISK_FREE_RATE = 0.02;

@Injectable()
export class PortfoliosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find portfolios by user email
   */
  async findByUserEmail(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        portfolios: {
          include: {
            positions: {
              include: { asset: true },
            },
          },
        },
      },
    });

    if (!user) {
      return [];
    }

    return user.portfolios;
  }

  /**
   * Find portfolio by ID with positions and recent contributions
   */
  async findById(id: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id },
      include: {
        positions: {
          include: { asset: true },
        },
        contributions: {
          orderBy: { contributedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    return portfolio;
  }

  /**
   * Get metrics history for a portfolio, enriched with contributions and metadata
   */
  async getMetrics(portfolioId: string) {
    const metrics = await this.executeWithRetry(() =>
      this.prisma.metricsTimeseries.findMany({
        where: { portfolioId },
        orderBy: { date: "asc" },
      })
    );

    const contributions = await this.executeWithRetry(() =>
      this.prisma.monthlyContribution.findMany({
        where: { portfolioId },
        orderBy: { contributedAt: "asc" },
      })
    );

    const contributionsByDate = new Map<string, number>();
    (contributions as any[]).forEach((contribution: any) => {
      const key = contribution.contributedAt.toISOString().split("T")[0];
      contributionsByDate.set(
        key,
        (contributionsByDate.get(key) || 0) + contribution.amount
      );
    });

    return (metrics as any[]).map((metric: any, index: number) => {
      const previous = index > 0 ? (metrics as any[])[index - 1] : null;
      const key = metric.date.toISOString().split("T")[0];
      const contribution = contributionsByDate.get(key) || 0;
      const pnl =
        previous && previous.equity
          ? metric.equity - previous.equity - contribution
          : 0;
      const pnlPercent =
        previous && previous.equity ? (pnl / previous.equity) * 100 : 0;

      let metadata: Record<string, any> | null = null;
      if (metric.metadataJson) {
        try {
          metadata = JSON.parse(metric.metadataJson);
        } catch {
          metadata = null;
        }
      }

      return {
        ...metric,
        contribution,
        pnl,
        pnlPercent,
        metadata,
      };
    });
  }

  async getDailyMetrics(portfolioId: string) {
    const dailyMetricClient = this.prisma.dailyMetric;
    return this.executeWithRetry(() =>
      dailyMetricClient.findMany({
        where: { portfolioId },
        orderBy: { date: "asc" },
      })
    );
  }

  /**
   * Get contribution history for the dashboard table.
   * Builds rows from initial capital + MonthlyContribution records,
   * enriched with the MetricsTimeseries snapshot of that date.
   */
  async getContributionHistory(portfolioId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { initialCapital: true, createdAt: true },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    const contributions = await this.prisma.monthlyContribution.findMany({
      where: { portfolioId },
      orderBy: { contributedAt: "asc" },
    });

    const metrics = await this.prisma.metricsTimeseries.findMany({
      where: { portfolioId },
      orderBy: { date: "asc" },
    });

    // Build date -> metric map (latest per date)
    const metricsByDate = new Map<string, any>();
    for (const m of metrics) {
      const key = m.date.toISOString().split("T")[0];
      metricsByDate.set(key, m);
    }

    const parseMetadata = (m: any) => {
      if (!m?.metadataJson) return null;
      try { return JSON.parse(m.metadataJson); } catch { return null; }
    };

    // Build all entries: onboarding + positive contributions
    const entries: Array<{ date: Date; amount: number }> = [
      { date: portfolio.createdAt, amount: portfolio.initialCapital },
    ];
    for (const c of contributions as any[]) {
      if (c.amount <= 0) continue;
      entries.push({ date: c.contributedAt, amount: c.amount });
    }

    // Pre-compute: for each date, find the last entry index (to assign market PnL)
    const lastIndexByDate = new Map<string, number>();
    entries.forEach((e, idx) => {
      lastIndexByDate.set(e.date.toISOString().split("T")[0], idx);
    });

    const rows: any[] = [];
    let prevEquity = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const dateKey = entry.date.toISOString().split("T")[0];
      const metric = metricsByDate.get(dateKey);
      const meta = parseMetadata(metric);
      const isLastOfDay = lastIndexByDate.get(dateKey) === i;

      let equity: number;
      let pnl: number;

      if (i === 0) {
        // Onboarding: equity = initialCapital, no PnL
        equity = entry.amount;
        pnl = 0;
      } else if (isLastOfDay && metric) {
        // Last entry of the day: reconcile with actual metric equity
        // This captures any market movement that happened during the day
        equity = metric.equity;
        pnl = equity - prevEquity - entry.amount;
      } else {
        // Same day, not last entry: accumulate, no market data between them
        equity = prevEquity + entry.amount;
        pnl = 0;
      }

      const pnlPercent = prevEquity > 0 ? (pnl / prevEquity) * 100 : 0;
      const exposure = metric?.exposure ?? 0;

      rows.push({
        date: entry.date,
        contribution: entry.amount,
        equity,
        exposure,
        leverage: equity > 0 && exposure > 0 ? exposure / equity : 0,
        composition: meta?.composition ?? [],
        pnl,
        pnlPercent,
      });

      prevEquity = equity;
    }

    return rows;
  }

  /**
   * Get portfolio summary with latest metrics, positions, and calculated returns
   */
  async getSummary(portfolioId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
        contributions: {
          orderBy: { contributedAt: "asc" },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    // Get latest and first metrics
    const latestMetrics = await this.prisma.metricsTimeseries.findFirst({
      where: { portfolioId },
      orderBy: { date: "desc" },
    });

    const dailyMetricClient = this.prisma.dailyMetric;
    const latestDailyMetric: { date: Date; equity: number } | null =
      dailyMetricClient
        ? await this.executeWithRetry(() =>
            dailyMetricClient.findFirst({
              where: { portfolioId },
              orderBy: { date: "desc" },
            })
          )
        : null;

    const firstMetrics = await this.prisma.metricsTimeseries.findFirst({
      where: { portfolioId },
      orderBy: { date: "asc" },
    });

    // Calculate total contributions (all) - includes initial capital
    const contributionsSum = portfolio.contributions.reduce(
      (sum: number, c: any) => sum + c.amount,
      0
    );
    // Total invested = initial capital + all contributions
    const totalContributions = (portfolio.initialCapital || 0) + contributionsSum;
    
    // Debug logging
    console.log(`[PortfoliosService] getSummary for portfolio ${portfolioId}:`);
    console.log(`  - initialCapital: ${portfolio.initialCapital}`);
    console.log(`  - contributions count: ${portfolio.contributions.length}`);
    console.log(`  - contributionsSum: ${contributionsSum}`);
    console.log(`  - totalContributions: ${totalContributions}`);

    // Calculate pending contributions (not deployed) - for display only
    // NOTE: Contributions are now marked as deployed immediately when registered,
    // so pending contributions should be 0 in normal operation
    const pendingContributions = portfolio.contributions
      .filter((c: any) => !c.deployed)
      .reduce((sum: number, c: any) => sum + c.amount, 0);

    // EQUITY CALCULATION STRATEGY:
    // The equity is the user's actual capital in the portfolio, NOT derived from exposure/borrowedAmount.
    // We trust the stored equity from DailyMetric (most recent) or MetricsTimeseries.
    // This is the value that the user confirmed during manual updates or that was set during contributions.
    //
    // IMPORTANT: We do NOT recalculate equity from exposure - borrowedAmount because:
    // 1. borrowedAmount may be stale if prices changed
    // 2. This would cause inconsistencies with what the user confirmed
    // 3. Contributions are already included in the stored equity value
    
    // Use the stored equity value directly - this is the source of truth
    const effectiveEquity = latestDailyMetric?.equity ?? latestMetrics?.equity ?? portfolio.initialCapital;
    
    console.log(`[getSummary] Equity calculation:`);
    console.log(`  - latestDailyMetric?.equity: ${latestDailyMetric?.equity ?? 'null'}`);
    console.log(`  - latestMetrics?.equity: ${latestMetrics?.equity ?? 'null'}`);
    console.log(`  - portfolio.initialCapital: ${portfolio.initialCapital}`);
    console.log(`  - effectiveEquity: ${effectiveEquity}`);

    // Calculate exposure in REAL-TIME from current positions and latest prices
    // This ensures accuracy even if metrics are outdated
    let currentExposure = 0;
    const latestPrices: Record<string, number> = {};

    for (const position of portfolio.positions) {
      // Get latest price for this asset
      const latestPrice = await this.prisma.assetPrice.findFirst({
        where: { assetId: position.assetId },
        orderBy: { date: "desc" },
      });
      const price = latestPrice?.close || position.avgPrice;
      latestPrices[position.assetId] = price;

      // Calculate current value of this position
      const positionValue = position.quantity * price;
      currentExposure += positionValue;
    }

    // Calculate leverage using effective equity and real-time exposure
    const currentLeverage =
      effectiveEquity > 0 ? currentExposure / effectiveEquity : 0;
    
    console.log(`[getSummary] Final equity: ${effectiveEquity}, exposure: ${currentExposure}, leverage: ${currentLeverage}`);

    // NOTE: We do NOT update DailyMetric here - this is a read-only operation
    // DailyMetric should only be updated by:
    // 1. ContributionsService (when registering a contribution)
    // 2. Daily check job (metrics-refresh.ts or daily-check.ts)
    // 3. RebalanceService (when accepting a rebalance)
    // Updating here would cause equity to accumulate on every page load!

    const absoluteReturn = effectiveEquity - totalContributions;
    const percentReturn =
      totalContributions > 0
        ? ((effectiveEquity - totalContributions) / totalContributions) * 100
        : 0;

    // Calculate position weights, PNL, and current prices using real-time exposure
    const positionsWithWeights = portfolio.positions.map((pos: any) => {
      const currentPrice = latestPrices[pos.assetId] || pos.avgPrice;
      const currentValue = pos.quantity * currentPrice;
      const pnl = (currentPrice - pos.avgPrice) * pos.quantity;
      const pnlPercent =
        pos.avgPrice > 0
          ? ((currentPrice - pos.avgPrice) / pos.avgPrice) * 100
          : 0;

      return {
        ...pos,
        currentPrice, // Current market price
        exposureUsd: currentValue, // Use real-time value
        pnl, // Profit/Loss in USD
        pnlPercent, // Profit/Loss percentage
        weight:
          currentExposure > 0 ? (currentValue / currentExposure) * 100 : 0,
      };
    });

    const allMetrics = await this.getMetrics(portfolioId);
    const analytics = this.calculatePortfolioAnalytics(
      allMetrics,
      totalContributions,
      portfolio.initialCapital,
      portfolio.contributions,
      portfolio.createdAt
    );

    console.log(`[getSummary] Analytics result - capitalFinal: ${analytics.capitalFinal}, totalInvested: ${analytics.totalInvested}`);

    return {
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        leverageMin: portfolio.leverageMin,
        leverageMax: portfolio.leverageMax,
      },
      metrics: {
        equity: effectiveEquity, // Now includes pending contributions
        exposure: currentExposure,
        leverage: currentLeverage,
        totalContributions,
        pendingContributions, // NEW: Show pending contributions separately
        absoluteReturn,
        percentReturn,
        startDate: firstMetrics?.date ?? undefined,
        lastUpdate: latestDailyMetric?.date ?? latestMetrics?.date ?? undefined,
      },
      positions: positionsWithWeights,
      analytics,
    };
  }

  private normalizeDate(value: string | Date): string {
    return new Date(value).toISOString().split("T")[0];
  }

  private buildDailyHistory(metrics: any[]): DailyHistoryEntry[] {
    const entries: DailyHistoryEntry[] = [];

    metrics.forEach((metric) => {
      const normalizedDate = this.normalizeDate(metric.date);

      if (metric.metadata?.dailySeries?.length) {
        metric.metadata.dailySeries.forEach((entry: any) => {
          entries.push({
            date: this.normalizeDate(entry.date),
            equity: entry.equity,
            exposure: entry.exposure,
          });
        });
      } else {
        entries.push({
          date: normalizedDate,
          equity: metric.equity,
          exposure: metric.exposure,
        });
      }
    });

    return entries
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .filter(
        (entry, idx, arr) => idx === 0 || entry.date !== arr[idx - 1].date
      );
  }

  private calculatePortfolioAnalytics(
    metricsHistory: any[],
    totalContributions: number,
    initialCapital: number,
    contributions: Array<{ amount: number; contributedAt: Date }> = [],
    portfolioCreatedAt?: Date
  ) {
    const dailyHistory = this.buildDailyHistory(metricsHistory);

    console.log(`[calculatePortfolioAnalytics] Metrics history length: ${metricsHistory.length}`);
    console.log(`[calculatePortfolioAnalytics] Daily history length: ${dailyHistory.length}`);
    console.log(`[calculatePortfolioAnalytics] Total contributions: ${totalContributions}`);

    if (dailyHistory.length === 0) {
      console.warn(`[calculatePortfolioAnalytics] No daily history, returning zeros`);
      return {
        capitalFinal: 0,
        totalInvested: totalContributions,
        absoluteReturn: 0,
        totalReturnPercent: 0,
        cagr: 0,
        xirr: null,
        volatility: 0,
        sharpe: 0,
        maxDrawdownEquity: 0,
        maxDrawdownExposure: 0,
        underwaterDays: 0,
        bestDay: null,
        worstDay: null,
      };
    }

    // If only one entry, use it as both first and last
    if (dailyHistory.length < 2) {
      const singleEntry = dailyHistory[0];
      console.log(`[calculatePortfolioAnalytics] Only one entry, equity: ${singleEntry.equity}`);
      const absoluteReturn = singleEntry.equity - totalContributions;
      const totalReturnPercent =
        totalContributions > 0 ? (absoluteReturn / totalContributions) * 100 : 0;
      
      const result = {
        capitalFinal: singleEntry.equity,
        totalInvested: totalContributions,
        absoluteReturn,
        totalReturnPercent,
        cagr: 0,
        xirr: null,
        volatility: 0,
        sharpe: 0,
        maxDrawdownEquity: 0,
        maxDrawdownExposure: 0,
        underwaterDays: singleEntry.equity < totalContributions ? 1 : 0,
        bestDay: null,
        worstDay: null,
      };
      
      console.log(`[calculatePortfolioAnalytics] Returning result with capitalFinal: ${result.capitalFinal}`);
      return result;
    }

    const contributionsByDate = new Map<string, number>();
    metricsHistory.forEach((metric) => {
      const key = this.normalizeDate(metric.date);
      const contribution = metric.contribution || 0;
      if (contribution > 0) {
        contributionsByDate.set(
          key,
          (contributionsByDate.get(key) || 0) + contribution
        );
      }
    });

    const firstValidIndex = dailyHistory.findIndex(
      (entry) => entry.equity > 0 && Number.isFinite(entry.equity)
    );
    const firstEntry =
      firstValidIndex >= 0 ? dailyHistory[firstValidIndex] : dailyHistory[0];
    const lastEntry = dailyHistory[dailyHistory.length - 1];
    
    console.log(`[calculatePortfolioAnalytics] First entry equity: ${firstEntry.equity}, date: ${firstEntry.date}`);
    console.log(`[calculatePortfolioAnalytics] Last entry equity: ${lastEntry.equity}, date: ${lastEntry.date}`);
    
    const absoluteReturn = lastEntry.equity - totalContributions;
    const totalReturnPercent =
      totalContributions > 0 ? (absoluteReturn / totalContributions) * 100 : 0;
    const years = Math.max(
      (new Date(lastEntry.date).getTime() -
        new Date(firstEntry.date).getTime()) /
        (1000 * 60 * 60 * 24 * 365.25),
      1 / 365
    );
    const cagr =
      firstEntry.equity > 0 && years > 0
        ? Math.pow(lastEntry.equity / firstEntry.equity, 1 / years) - 1
        : 0;

    const dailyReturns: Array<{ ret: number; date: string }> = [];
    let bestReturn = Number.NEGATIVE_INFINITY;
    let bestDate = "";
    let worstReturn = Number.POSITIVE_INFINITY;
    let worstDate = "";
    let equityPeak = firstEntry.equity;
    let maxDrawdownEquity = 0;
    let exposurePeak = firstEntry.exposure;
    let maxDrawdownExposure = 0;
    let underwaterDays = 0;
    let cumulativeInvested = initialCapital; // Track cumulative invested capital

    for (let i = 1; i < dailyHistory.length; i++) {
      const point = dailyHistory[i];
      const prev = dailyHistory[i - 1];
      const contribution = contributionsByDate.get(point.date) || 0;
      const equityChange = point.equity - prev.equity;
      const ret =
        prev.equity > 0 ? (equityChange - contribution) / prev.equity : 0;

      if (ret > bestReturn) {
        bestReturn = ret;
        bestDate = point.date;
      }
      if (ret < worstReturn) {
        worstReturn = ret;
        worstDate = point.date;
      }

      dailyReturns.push({ ret, date: point.date });

      // Update cumulative invested capital (initial + all contributions up to this point)
      cumulativeInvested += contribution;

      equityPeak = Math.max(equityPeak, point.equity);
      const drawdown = point.equity / equityPeak - 1;
      maxDrawdownEquity = Math.min(maxDrawdownEquity, drawdown);

      // Underwater days: count days where equity is below cumulative invested capital
      // This measures how many days the portfolio was below the total amount invested
      if (point.equity < cumulativeInvested) {
        underwaterDays += 1;
      }

      exposurePeak = Math.max(exposurePeak, point.exposure);
      const exposureDrawdown = point.exposure / exposurePeak - 1;
      maxDrawdownExposure = Math.min(maxDrawdownExposure, exposureDrawdown);
    }

    // Build XIRR cash flows
    const xirrCashFlows: Array<{ amount: number; date: Date }> = [];
    const startDate = portfolioCreatedAt || new Date(firstEntry.date);
    if (initialCapital > 0) {
      xirrCashFlows.push({ amount: -initialCapital, date: startDate });
    }
    for (const c of contributions) {
      xirrCashFlows.push({ amount: -c.amount, date: new Date(c.contributedAt) });
    }
    xirrCashFlows.push({ amount: lastEntry.equity, date: new Date(lastEntry.date) });
    const xirr = this.calculateXIRR(xirrCashFlows);

    if (dailyReturns.length === 0) {
      const result = {
        capitalFinal: lastEntry.equity,
        totalInvested: totalContributions,
        absoluteReturn,
        totalReturnPercent,
        cagr,
        xirr,
        volatility: 0,
        sharpe: 0,
        maxDrawdownEquity,
        maxDrawdownExposure,
        underwaterDays,
        bestDay: null,
        worstDay: null,
      };
      console.log(`[calculatePortfolioAnalytics] Returning result (no returns) with capitalFinal: ${result.capitalFinal}`);
      return result;
    }

    const meanReturn =
      dailyReturns.reduce((sum, entry) => sum + entry.ret, 0) /
      dailyReturns.length;
    const variance =
      dailyReturns.length > 1
        ? dailyReturns.reduce(
            (sum, entry) => sum + Math.pow(entry.ret - meanReturn, 2),
            0
          ) /
          (dailyReturns.length - 1)
        : 0;
    const volatility = Math.sqrt(variance) * Math.sqrt(252);
    const sharpe =
      volatility > 0 ? (meanReturn * 252 - RISK_FREE_RATE) / volatility : 0;

    const result = {
      capitalFinal: lastEntry.equity,
      totalInvested: totalContributions,
      absoluteReturn,
      totalReturnPercent,
      cagr,
      xirr,
      volatility,
      sharpe,
      maxDrawdownEquity,
      maxDrawdownExposure,
      underwaterDays,
      bestDay:
        bestDate && bestReturn !== Number.NEGATIVE_INFINITY
          ? { date: bestDate, return: bestReturn }
          : null,
      worstDay:
        worstDate && worstReturn !== Number.POSITIVE_INFINITY
          ? { date: worstDate, return: worstReturn }
          : null,
    };
    
    console.log(`[calculatePortfolioAnalytics] Returning result (with returns) with capitalFinal: ${result.capitalFinal}`);
    return result;
  }

  /**
   * Calculate XIRR (Extended Internal Rate of Return) using Newton-Raphson method.
   * Accounts for timing of cash flows (initial capital, contributions, final value).
   */
  private calculateXIRR(
    cashFlows: Array<{ amount: number; date: Date }>
  ): number | null {
    if (cashFlows.length < 2) return null;

    const dates = cashFlows.map((cf) => cf.date.getTime());
    const amounts = cashFlows.map((cf) => cf.amount);
    const d0 = dates[0];

    // Years from first date for each cash flow
    const years = dates.map(
      (d) => (d - d0) / (365.25 * 24 * 60 * 60 * 1000)
    );

    // NPV function: sum of amount_i / (1+r)^t_i
    const npv = (r: number): number => {
      let sum = 0;
      for (let i = 0; i < amounts.length; i++) {
        const denom = Math.pow(1 + r, years[i]);
        if (!Number.isFinite(denom) || denom === 0) return Number.NaN;
        sum += amounts[i] / denom;
      }
      return sum;
    };

    // Derivative of NPV
    const dnpv = (r: number): number => {
      let sum = 0;
      for (let i = 0; i < amounts.length; i++) {
        const denom = Math.pow(1 + r, years[i] + 1);
        if (!Number.isFinite(denom) || denom === 0) return Number.NaN;
        sum -= (years[i] * amounts[i]) / denom;
      }
      return sum;
    };

    // Newton-Raphson iteration
    let rate = 0.1; // Initial guess: 10%
    const maxIter = 100;
    const tolerance = 1e-7;

    for (let i = 0; i < maxIter; i++) {
      const f = npv(rate);
      const df = dnpv(rate);

      if (!Number.isFinite(f) || !Number.isFinite(df) || Math.abs(df) < 1e-12) {
        return null;
      }

      const newRate = rate - f / df;

      if (Math.abs(newRate - rate) < tolerance) {
        // Sanity check: rate should be reasonable (-0.99 to 10 = -99% to 1000%)
        if (newRate <= -1 || newRate > 10) return null;
        return newRate;
      }

      rate = newRate;

      // Guard against divergence
      if (rate < -0.99 || rate > 10) return null;
    }

    return null; // Did not converge
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    retries = 3,
    delayMs = 1000
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt++;
        if (attempt >= retries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
}
