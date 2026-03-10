import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

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
   * Count portfolios owned by a user
   */
  async countByUser(userId: string): Promise<number> {
    return this.prisma.portfolio.count({ where: { userId } });
  }

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

    // Enrich each portfolio with latest equity/leverage from DailyMetric
    const enriched = await Promise.all(
      user.portfolios.map(async (portfolio) => {
        const latestMetric = await this.prisma.dailyMetric.findFirst({
          where: { portfolioId: portfolio.id },
          orderBy: { date: "desc" },
          select: { equity: true, leverage: true },
        });
        return {
          ...portfolio,
          latestEquity: latestMetric?.equity ?? null,
          latestLeverage: latestMetric?.leverage ?? null,
        };
      })
    );

    return enriched;
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
   * Delete a portfolio (cascade handles all children).
   * Users must keep at least one portfolio.
   */
  async deletePortfolio(userId: string, portfolioId: string) {
    const count = await this.prisma.portfolio.count({
      where: { userId },
    });

    if (count <= 1) {
      throw new BadRequestException(
        "No puedes eliminar tu unico portfolio. Crea otro primero."
      );
    }

    await this.prisma.portfolio.delete({
      where: { id: portfolioId },
    });

    return { success: true };
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
      const signed = contribution.type === "withdrawal" ? -contribution.amount : contribution.amount;
      contributionsByDate.set(
        key,
        (contributionsByDate.get(key) || 0) + signed
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

    const rows: Array<{ date: Date; contribution: number; cumulative: number; type: string }> = [];
    let cumulative = 0;

    // Onboarding row (initial capital)
    cumulative += portfolio.initialCapital;
    rows.push({
      date: portfolio.createdAt,
      contribution: portfolio.initialCapital,
      cumulative,
      type: "initial",
    });

    // Contribution and withdrawal rows
    for (const c of contributions as any[]) {
      const isWithdrawal = c.type === "withdrawal";
      const signed = isWithdrawal ? -c.amount : c.amount;
      cumulative += signed;
      rows.push({
        date: c.contributedAt,
        contribution: signed,
        cumulative,
        type: c.type || "contribution",
      });
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

    // Split contributions into deposits and withdrawals
    const totalDeposited = portfolio.contributions
      .filter((c: any) => c.type !== "withdrawal")
      .reduce((sum: number, c: any) => sum + c.amount, 0);
    const totalWithdrawn = portfolio.contributions
      .filter((c: any) => c.type === "withdrawal")
      .reduce((sum: number, c: any) => sum + c.amount, 0);

    // Total invested = initial capital + deposits (not withdrawals)
    const totalContributions = (portfolio.initialCapital || 0) + totalDeposited;

    // Debug logging
    console.log(`[PortfoliosService] getSummary for portfolio ${portfolioId}:`);
    console.log(`  - initialCapital: ${portfolio.initialCapital}`);
    console.log(`  - contributions count: ${portfolio.contributions.length}`);
    console.log(`  - totalDeposited: ${totalDeposited}`);
    console.log(`  - totalWithdrawn: ${totalWithdrawn}`);
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

    // absoluteReturn = total PnL (realized + unrealized) from equity perspective
    // Uses stored equity which correctly tracks all historical gains/losses,
    // even from positions that were sold or removed.
    const absoluteReturn = (effectiveEquity + totalWithdrawn) - totalContributions;
    // percentReturn will be replaced by TWR from analytics (set below after analytics calculation)
    let percentReturn = 0;

    // Calculate position weights, PNL, and current prices using real-time exposure
    // NOTE: per-asset PnL is UNREALIZED only — it won't sum to absoluteReturn
    // if there are realized gains from closed positions or rounding differences.
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
        pnl, // Profit/Loss in USD (unrealized)
        pnlPercent, // Profit/Loss percentage (unrealized)
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
      portfolio.createdAt,
      totalWithdrawn
    );

    // Use simple return as the headline percent return (intuitive, like Robinhood/Coinbase)
    // TWR remains available in the analytics panel as an advanced metric
    percentReturn = totalContributions > 0
      ? (absoluteReturn / totalContributions) * 100
      : 0;

    console.log(`[getSummary] Analytics result - capitalFinal: ${analytics.capitalFinal}, totalInvested: ${analytics.totalInvested}, TWR: ${analytics.twr}`);

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
        totalWithdrawn,
        pendingContributions, // NEW: Show pending contributions separately
        absoluteReturn,
        percentReturn, // Simple return: (PnL / totalInvested) × 100
        twr: analytics.twr,
        startDate: firstMetrics?.date ?? portfolio.createdAt,
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
    contributions: Array<{ amount: number; type?: string; contributedAt: Date }> = [],
    portfolioCreatedAt?: Date,
    totalWithdrawn: number = 0
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
        totalWithdrawn,
        absoluteReturn: 0,
        totalReturnPercent: 0,
        twr: null as number | null,
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

    // Insert synthetic "day 0" data point with initialCapital so the first day's
    // market return is captured. Without this, if the portfolio was created and
    // rebalanced on the same day, the first metric already reflects market gains
    // and we lose the day-1 return entirely.
    if (
      initialCapital > 0 &&
      dailyHistory.length >= 1 &&
      Math.abs(dailyHistory[0].equity - initialCapital) > 0.01
    ) {
      const firstDate = new Date(dailyHistory[0].date);
      const syntheticDate = new Date(firstDate);
      syntheticDate.setDate(syntheticDate.getDate() - 1);
      const syntheticDateStr = syntheticDate.toISOString().split("T")[0];

      dailyHistory.unshift({
        date: syntheticDateStr,
        equity: initialCapital,
        exposure: 0,
      });
      console.log(
        `[calculatePortfolioAnalytics] Inserted synthetic day-0: ${syntheticDateStr}, equity=${initialCapital}`
      );
    }

    // If only one entry, use it as both first and last
    if (dailyHistory.length < 2) {
      const singleEntry = dailyHistory[0];
      console.log(`[calculatePortfolioAnalytics] Only one entry, equity: ${singleEntry.equity}`);
      const absoluteReturn = (singleEntry.equity + totalWithdrawn) - totalContributions;
      const totalReturnPercent =
        totalContributions > 0 ? (absoluteReturn / totalContributions) * 100 : 0;

      const result = {
        capitalFinal: singleEntry.equity,
        totalInvested: totalContributions,
        totalWithdrawn,
        absoluteReturn,
        totalReturnPercent,
        twr: null as number | null,
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

    // contributionsByDate already includes sign (from getMetrics)
    const contributionsByDate = new Map<string, number>();
    metricsHistory.forEach((metric) => {
      const key = this.normalizeDate(metric.date);
      const contribution = metric.contribution || 0;
      if (contribution !== 0) {
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
    
    // absoluteReturn = total PnL: (equity + withdrawn) - deposited
    const absoluteReturn = (lastEntry.equity + totalWithdrawn) - totalContributions;
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

      // Update cumulative invested capital (only increases with deposits, not withdrawals)
      if (contribution > 0) {
        cumulativeInvested += contribution;
      }

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
    // Contributions are negative (money into portfolio), withdrawals are positive (money out)
    const xirrCashFlows: Array<{ amount: number; date: Date }> = [];
    const startDate = portfolioCreatedAt || new Date(firstEntry.date);
    if (initialCapital > 0) {
      xirrCashFlows.push({ amount: -initialCapital, date: startDate });
    }
    for (const c of contributions) {
      const isWithdrawal = (c as any).type === "withdrawal";
      xirrCashFlows.push({
        amount: isWithdrawal ? c.amount : -c.amount,
        date: new Date(c.contributedAt),
      });
    }
    xirrCashFlows.push({ amount: lastEntry.equity, date: new Date(lastEntry.date) });
    const xirr = this.calculateXIRR(xirrCashFlows);

    // TWR (Time-Weighted Return) calculation
    // Chains sub-period returns between cash flows to eliminate contribution/withdrawal distortion
    const twr = this.calculateTWR(dailyHistory, contributionsByDate);

    if (dailyReturns.length === 0) {
      const result = {
        capitalFinal: lastEntry.equity,
        totalInvested: totalContributions,
        totalWithdrawn,
        absoluteReturn,
        totalReturnPercent,
        twr,
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
      totalWithdrawn,
      absoluteReturn,
      totalReturnPercent,
      twr,
      cagr,
      xirr,
      volatility,
      sharpe,
      maxDrawdownEquity,
      maxDrawdownExposure,
      underwaterDays,
      bestDay:
        bestDate && bestReturn !== Number.NEGATIVE_INFINITY && dailyReturns.length >= 2
          ? { date: bestDate, return: bestReturn }
          : null,
      worstDay:
        worstDate && worstReturn !== Number.POSITIVE_INFINITY && dailyReturns.length >= 2
          ? { date: worstDate, return: worstReturn }
          : null,
    };

    console.log(`[calculatePortfolioAnalytics] Returning result (with returns) with capitalFinal: ${result.capitalFinal}, TWR: ${twr}`);
    return result;
  }

  /**
   * Calculate TWR (Time-Weighted Return).
   * Chains sub-period returns between cash flow events so that contributions and
   * withdrawals don't distort the reported yield.
   *
   * TWR = (1 + r₁) × (1 + r₂) × ... × (1 + rₙ) - 1
   * where rᵢ = equity_before_cashflow / equity_after_prev_cashflow - 1
   */
  private calculateTWR(
    dailyHistory: DailyHistoryEntry[],
    contributionsByDate: Map<string, number>
  ): number | null {
    if (dailyHistory.length < 2) return null;

    let twrProduct = 1;
    let periodStartEquity = dailyHistory[0].equity;

    if (periodStartEquity <= 0) return null;

    for (let i = 1; i < dailyHistory.length; i++) {
      const point = dailyHistory[i];
      const cashFlow = contributionsByDate.get(point.date) || 0;

      if (cashFlow !== 0) {
        // End of sub-period: equity BEFORE the cash flow was applied
        const equityBeforeCashFlow = point.equity - cashFlow;
        if (periodStartEquity > 0) {
          const subReturn = equityBeforeCashFlow / periodStartEquity;
          twrProduct *= subReturn;
        }
        // Start new sub-period from equity AFTER cash flow (= point.equity)
        periodStartEquity = point.equity;
      } else if (i === dailyHistory.length - 1) {
        // Final sub-period (no cash flow today)
        if (periodStartEquity > 0) {
          const subReturn = point.equity / periodStartEquity;
          twrProduct *= subReturn;
        }
      }
    }

    // If no cash flows at all, just compute simple return
    if (contributionsByDate.size === 0) {
      const last = dailyHistory[dailyHistory.length - 1];
      const first = dailyHistory[0];
      if (first.equity > 0) {
        return last.equity / first.equity - 1;
      }
      return null;
    }

    // Close the last sub-period if it wasn't closed by a cash flow on the last day
    const lastDate = dailyHistory[dailyHistory.length - 1].date;
    const lastCashFlow = contributionsByDate.get(lastDate) || 0;
    if (lastCashFlow === 0 && dailyHistory.length > 1) {
      // Already handled in the loop above at i === length - 1
    }

    const twr = twrProduct - 1;

    // Sanity check
    if (!Number.isFinite(twr) || twr < -1 || twr > 100) return null;

    return twr;
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
