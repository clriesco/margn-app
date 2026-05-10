import { Injectable, NotFoundException } from "@nestjs/common";

import { PortfolioConfigurationService } from "../portfolios/portfolio-configuration.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Metaparameters for rebalancing algorithm
 * Based on BacktestHistorical.ipynb METAPARAMETERS
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RebalanceMetaparameters {
  leverage: number;
  minLeverage: number;
  maxLeverage: number;
  maxWeight: number;
  minWeight: number;
  drawdownRedeployThreshold: number;
  weightDeviationThreshold: number;
  volatilityLookbackDays: number;
  volatilityRedeployThreshold: number;
  gradualDeployFactor: number;
  meanReturnShrinkage: number; // Added: shrinkage for mean returns
  riskFreeRate: number; // Added: configurable risk-free rate
  useDynamicSharpeRebalance: boolean;
  yearlyTradingDays: number;
}

/**
 * Default metaparameters from notebook
 * Matches METAPARAMETERS in BacktestHistorical.ipynb
 * @deprecated Not currently used, kept for reference
 */
// const DEFAULT_METAPARAMETERS: RebalanceMetaparameters = {
//   leverage: 2.5,
//   minLeverage: 2.5,
//   maxLeverage: 3.0,
//   maxWeight: 0.4, // 40% max per asset for more flexibility
//   minWeight: 0.05, // 5% min per asset for more flexibility
//   drawdownRedeployThreshold: 0.12, // 12% drawdown triggers full deploy
//   weightDeviationThreshold: 0.05, // 5% weight deviation triggers rebalance
//   volatilityLookbackDays: 63,
//   volatilityRedeployThreshold: 0.18, // 18% annualized volatility
//   gradualDeployFactor: 0.5,
//   meanReturnShrinkage: 0.6, // Shrinkage applied to historical mean returns for realism
//   riskFreeRate: 0.02, // 2% risk-free rate
//   useDynamicSharpeRebalance: true, // Dynamic Sharpe optimization enabled
//   yearlyTradingDays: 252,
// };

/**
 * Initial portfolio weights from notebook (PORTFOLIO_INITIAL)
 * @deprecated Not currently used, kept for reference
 */
// const PORTFOLIO_INITIAL: Record<string, number> = {
//   SPY: 0.6,
//   TLT: 0.15,
//   VT: 0.2,
//   "BTC-USD": 0.05,
// };

/**
 * Position in the proposal
 */
export interface ProposalPosition {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  currentQuantity: number;
  currentValue: number;
  targetQuantity: number;
  targetValue: number;
  deltaQuantity: number;
  deltaValue: number;
  targetWeight: number;
  currentWeight: number;
  currentPrice: number;
  action: "BUY" | "SELL" | "HOLD";
}

/**
 * Determine if an asset supports fractional shares
 * Crypto and forex support fractions, stocks/ETFs/commodities require whole shares
 */
function isFractionalAsset(symbol: string, assetType?: string): boolean {
  // 1. Forex: suffix =X (Yahoo Finance convention)
  if (symbol.endsWith('=X')) return true;  // EURUSD=X, GBPUSD=X

  // 2. Crypto: pattern XXX-USD with short base symbol (≤5 chars)
  if (symbol.includes('-USD')) {
    const base = symbol.split('-')[0];
    if (base.length <= 5) return true;  // BTC-USD, ETH-USD, SOL-USD
  }

  // 3. Use assetType from database if available
  if (assetType === 'crypto' || assetType === 'forex') return true;

  // 4. Everything else: whole shares (stocks, ETFs, commodities, bonds)
  return false;
}

/**
 * Rebalance proposal interface
 */
export interface RebalanceProposal {
  // Current state
  currentEquity: number;
  currentExposure: number;
  currentLeverage: number;

  // Target state
  targetLeverage: number;
  targetExposure: number;

  // Deploy signals
  deployFraction: number;
  deploySignals: {
    drawdownTriggered: boolean;
    weightDeviationTriggered: boolean;
    volatilityTriggered: boolean;
  };

  // Metrics used for decision
  drawdown: number;
  peakEquity: number;
  weightDeviation: number;
  realizedVolatility: number | null;

  // Pending contribution
  pendingContribution: number;

  // Positions
  positions: ProposalPosition[];

  // Summary after rebalance
  summary: {
    newEquity: number;
    newExposure: number;
    newLeverage: number;
    equityUsedFromContribution: number;
    borrowIncrease: number;
  };

  // Weights used (static or dynamically computed)
  weightsUsed: Record<string, number>;
  dynamicWeightsComputed: boolean;
}

/**
 * Service for portfolio rebalancing simulation
 * Implements mathematical optimization from BacktestHistorical.ipynb
 */
@Injectable()
export class RebalanceService {
  constructor(
    private prisma: PrismaService,
    private configService: PortfolioConfigurationService
  ) {}

  /**
   * Calculate rebalance proposal for a portfolio
   * Implements apply_monthly_rebalancing logic from notebook
   *
   * @param portfolioId - Portfolio ID
   * @returns Rebalance proposal with target allocations
   */
  async calculateProposal(portfolioId: string): Promise<RebalanceProposal> {
    // 1. Get portfolio configuration (uses actual portfolio settings)
    const config = await this.configService.getConfiguration(portfolioId);
    const targetWeights = config.targetWeights;

    // 2. Get portfolio with positions and history
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        positions: {
          include: { asset: true },
        },
        contributions: {
          where: { deployed: false },
          orderBy: { contributedAt: "desc" },
        },
        metricsTimeseries: {
          orderBy: { date: "desc" },
          take: config.volatilityLookbackDays + 10,
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

    // 3. Get all assets with their latest prices
    const assets = await this.prisma.asset.findMany();
    const latestPrices = await this.getLatestPrices(assets);

    // 4. Calculate current portfolio state (includes pending contributions)
    const currentState = this.calculateCurrentState(
      portfolio,
      latestPrices,
      assets
    );

    // 5. Calculate deploy signals (using portfolio config thresholds)
    const deploySignals = this.calculateDeploySignals(
      currentState,
      portfolio.metricsTimeseries,
      targetWeights,
      config
    );

    // 6. Determine weights to use - always use Sharpe optimization
    // Get assets that are in the portfolio (have positions) or in target weights
    const portfolioAssetSymbols = new Set(
      portfolio.positions.map((p: any) => p.asset.symbol)
    );
    const relevantAssets = assets.filter(
      (a: any) => portfolioAssetSymbols.has(a.symbol) || targetWeights[a.symbol] !== undefined
    );
    
    const weightsToUse = await this.determineWeights(
      portfolioId,
      relevantAssets,
      deploySignals.monthNumber,
      targetWeights,
      config
    );

    // 7. Calculate pending contribution (undeployed) - for display only
    // NOTE: Contributions go directly to equity when registered,
    // so pendingContribution should be 0 in normal operation
    // We still calculate it for the response, but don't use it in calculations
    const pendingContribution = this.calculatePendingContribution(
      portfolio.contributions
    );

    // 8. Equity remains the same when rebalancing to increase exposure
    // Contributions are already included in currentState.equity
    const equityForCalculations = currentState.equity;

    // 9. Calculate target exposure based on leverage target (not minimum)
    // When rebalancing to increase exposure, we target leverageTarget, not leverageMin
    const targetExposure = this.calculateTargetExposure(
      equityForCalculations,
      currentState.exposure,
      0, // Don't use pending contributions in calculations - they're already in equity
      deploySignals.deployFraction,
      config
    );

    // 9. Calculate target positions
    const positions = this.calculateTargetPositions(
      currentState,
      targetExposure,
      weightsToUse.weights,
      assets,
      latestPrices,
      portfolio.requireWholeShares
    );

    // 10. Actual exposure after rounding (sum of rounded position values)
    const actualExposure = positions.reduce((sum, p) => sum + p.targetValue, 0);

    // 11. Calculate equity/borrow breakdown
    // Don't use pendingContribution - contributions are already in equity
    const breakdown = this.calculateEquityBorrowBreakdown(
      currentState.exposure,
      actualExposure,
      currentState.equity, // Pass equity for calculations
      config
    );

    return {
      currentEquity: currentState.equity,
      currentExposure: currentState.exposure,
      currentLeverage: currentState.leverage,
      targetLeverage: config.leverageTarget,
      targetExposure,
      deployFraction: deploySignals.deployFraction,
      deploySignals: {
        drawdownTriggered: deploySignals.drawdownTriggered,
        weightDeviationTriggered: deploySignals.weightDeviationTriggered,
        volatilityTriggered: deploySignals.volatilityTriggered,
      },
      drawdown: deploySignals.drawdown,
      peakEquity: currentState.peakEquity,
      weightDeviation: deploySignals.weightDeviation,
      realizedVolatility: deploySignals.realizedVolatility,
      pendingContribution,
      positions,
      summary: {
        newEquity: currentState.equity, // Equity doesn't change when rebalancing to buy assets
        newExposure: actualExposure,
        newLeverage: currentState.equity > 0 ? actualExposure / currentState.equity : 0,
        equityUsedFromContribution: breakdown.equityUsed,
        borrowIncrease: breakdown.borrowIncrease,
      },
      weightsUsed: weightsToUse.weights,
      dynamicWeightsComputed: weightsToUse.isDynamic,
    };
  }

  /**
   * Calculate current portfolio state
   * IMPORTANT: Includes pending contributions in equity (same as recommendations service)
   */
  private calculateCurrentState(
    portfolio: any,
    latestPrices: Record<string, number>,
    _assets: any[]
  ): {
    equity: number;
    exposure: number;
    leverage: number;
    peakEquity: number;
    positionValues: Record<string, number>;
    positionQuantities: Record<string, number>;
  } {
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

    // Get base equity from latest metrics
    let baseEquity = portfolio.initialCapital;
    if (portfolio.dailyMetrics?.length > 0) {
      baseEquity = portfolio.dailyMetrics[0].equity;
    } else if (portfolio.metricsTimeseries.length > 0) {
      baseEquity = portfolio.metricsTimeseries[0].equity;
    }

    // Calculate pending contributions (not deployed) - for display only
    // NOTE: Contributions are now marked as deployed immediately when registered,
    // so pending contributions should be 0 in normal operation
    // const pendingContributions = portfolio.contributions
    //   .filter((c: any) => !c.deployed)
    //   .reduce((sum: number, c: any) => sum + c.amount, 0);

    // Equity should already include all contributions (they're marked as deployed immediately)
    // We do NOT add pendingContributions here to avoid double-counting
    const effectiveEquity = baseEquity;

    // Calculate peak equity from history
    let peakEquity = effectiveEquity;
    if (portfolio.dailyMetrics?.length > 0) {
      peakEquity = portfolio.dailyMetrics[0].peakEquity || effectiveEquity;
    }
    for (const metric of portfolio.metricsTimeseries) {
      if (metric.equity > peakEquity) {
        peakEquity = metric.equity;
      }
    }

    const leverage = effectiveEquity > 0 ? exposure / effectiveEquity : 0;

    return {
      equity: effectiveEquity, // Now includes pending contributions
      exposure,
      leverage,
      peakEquity,
      positionValues,
      positionQuantities,
    };
  }

  /**
   * Calculate deploy signals based on drawdown, weight deviation, and volatility
   * Implements the deploy_fraction logic from notebook
   * Now uses portfolio configuration instead of hardcoded values
   */
  private calculateDeploySignals(
    currentState: any,
    metricsHistory: any[],
    targetWeights: Record<string, number>,
    config: any
  ): {
    deployFraction: number;
    drawdown: number;
    weightDeviation: number;
    realizedVolatility: number | null;
    drawdownTriggered: boolean;
    weightDeviationTriggered: boolean;
    volatilityTriggered: boolean;
    monthNumber: number;
  } {
    const { equity, peakEquity, positionValues, exposure } = currentState;

    // Calculate drawdown
    const drawdown = peakEquity > 0 ? equity / peakEquity - 1 : 0;

    // Calculate weight deviation from target (using portfolio config weights)
    let weightDeviation = 0;
    if (exposure > 0) {
      for (const [symbol, targetWeight] of Object.entries(targetWeights)) {
        const currentValue = positionValues[symbol] || 0;
        const currentWeight = currentValue / exposure;
        const deviation = Math.abs(currentWeight - targetWeight);
        if (deviation > weightDeviation) {
          weightDeviation = deviation;
        }
      }
    }

    // Calculate realized volatility from equity history (using portfolio config)
    let realizedVolatility: number | null = null;
    if (metricsHistory.length >= 2) {
      const equityValues = metricsHistory
        .slice(0, config.volatilityLookbackDays + 1)
        .map((m) => m.equity)
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
          realizedVolatility = dailyVol * Math.sqrt(252); // Annualize
        }
      }
    }

    // Estimate month number from metrics history
    const monthNumber = Math.max(1, Math.ceil(metricsHistory.length / 21));

    // Determine deploy fraction based on signals (using portfolio config thresholds)
    let deployFraction = 0;
    let drawdownTriggered = false;
    let weightDeviationTriggered = false;
    let volatilityTriggered = false;

    // Condition 1: Drawdown exceeds threshold → full deploy
    if (drawdown <= -config.drawdownRedeployThreshold) {
      deployFraction = 1.0;
      drawdownTriggered = true;
    } else {
      // Condition 2: Weight deviation exceeds threshold
      if (weightDeviation >= config.weightDeviationThreshold) {
        deployFraction = 1.0;
        weightDeviationTriggered = true;
      }

      // Condition 3: Volatility below threshold (calm market)
      if (
        realizedVolatility !== null &&
        realizedVolatility <= config.volatilityRedeployThreshold
      ) {
        deployFraction = 1.0;
        volatilityTriggered = true;
      }
    }

    // Apply gradual deploy factor (from portfolio config)
    if (deployFraction > 0) {
      deployFraction = Math.min(deployFraction, config.gradualDeployFactor);
    }

    return {
      deployFraction,
      drawdown,
      weightDeviation,
      realizedVolatility,
      drawdownTriggered,
      weightDeviationTriggered,
      volatilityTriggered,
      monthNumber,
    };
  }

  /**
   * Determine weights to use - always try Sharpe optimization first
   * Implements compute_optimal_sharpe_weights from notebook
   * Uses portfolio configuration target weights only as constraints/fallback
   */
  private async determineWeights(
    portfolioId: string,
    assets: any[],
    monthNumber: number,
    targetWeights: Record<string, number>,
    config: any
  ): Promise<{ weights: Record<string, number>; isDynamic: boolean }> {
    // Use Sharpe optimization only if enabled, otherwise use manual target weights
    const shouldUseSharpe = config.useDynamicSharpeRebalance === true;

    if (shouldUseSharpe) {
      try {
        console.log(`[Rebalance] Attempting Sharpe optimization for portfolio ${portfolioId}`);
        console.log(`[Rebalance] Assets to consider: ${assets.map(a => a.symbol).join(', ')}`);
        console.log(`[Rebalance] Target weights:`, targetWeights);
        
        const optimalWeights = await this.computeOptimalSharpeWeights(
          portfolioId,
          assets,
          targetWeights,
          config
        );
        
        console.log(`[Rebalance] Optimal weights computed:`, optimalWeights);
        
        // Verify we got valid weights (not just fallback)
        const hasValidWeights = Object.values(optimalWeights).some(w => w > 0);
        if (hasValidWeights) {
          const sum = Object.values(optimalWeights).reduce((a, b) => a + b, 0);
          console.log(`[Rebalance] Using Sharpe-optimized weights (sum: ${sum.toFixed(4)})`);
          return { weights: optimalWeights, isDynamic: true };
        } else {
          console.warn(`[Rebalance] Optimal weights are invalid (all zero), falling back`);
        }
      } catch (error) {
        console.error(
          `[Rebalance] Failed to compute dynamic Sharpe weights, falling back to portfolio target weights:`,
          error instanceof Error ? error.message : error
        );
        if (error instanceof Error && error.stack) {
          console.error(`[Rebalance] Stack trace:`, error.stack);
        }
      }
    }

    // Fallback to portfolio target weights only if Sharpe optimization fails
    return { weights: { ...targetWeights }, isDynamic: false };
  }

  /**
   * Compute optimal Sharpe-maximizing weights
   * Implements compute_optimal_sharpe_weights from notebook
   *
   * Key differences from simple implementation:
   * 1. Uses ALL accumulated historical returns (not just last N days)
   * 2. Applies mean_return_shrinkage to be more conservative
   * 3. Uses proper SLSQP-like optimization (Nelder-Mead approximation)
   * Now uses portfolio configuration for constraints and parameters
   */
  private async computeOptimalSharpeWeights(
    portfolioId: string,
    assets: any[],
    targetWeights: Record<string, number>,
    config: any
  ): Promise<Record<string, number>> {
    // Get historical prices for assets
    // If sharpeWeightsLookbackMonths > 0, use only that many months of data
    // Otherwise use all available history
    const assetReturns: Record<string, number[]> = {};
    const assetSymbols: string[] = [];

    // Calculate lookback date if configured
    const lookbackMonths = config.sharpeWeightsLookbackMonths || 0;
    let lookbackDate: Date | null = null;
    if (lookbackMonths > 0) {
      lookbackDate = new Date();
      lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
      console.log(`[Sharpe Optimization] Using ${lookbackMonths} months lookback (from ${lookbackDate.toISOString().split('T')[0]})`);
    } else {
      console.log(`[Sharpe Optimization] Using all available history`);
    }

    // Use all assets passed in (should include all portfolio positions)
    // This allows Sharpe optimization to find the best allocation
    const assetsToConsider = assets;

    for (const asset of assetsToConsider) {
      const prices = await this.prisma.assetPrice.findMany({
        where: {
          assetId: asset.id,
          ...(lookbackDate && { date: { gte: lookbackDate } }),
        },
        orderBy: { date: "asc" }, // Ascending to get chronological order
      });

      // Reduced minimum history requirement - try with at least 20 days
      if (prices.length < 20) continue;

      // Calculate log returns (chronological order)
      const returns: number[] = [];
      for (let i = 1; i < prices.length; i++) {
        if (prices[i - 1].close > 0) {
          returns.push(Math.log(prices[i].close / prices[i - 1].close));
        }
      }

      if (returns.length > 0) {
        assetReturns[asset.symbol] = returns;
        assetSymbols.push(asset.symbol);
      }
    }

    // Need at least 2 assets with sufficient history for optimization
    if (assetSymbols.length < 2) {
      const errorMsg = `Insufficient assets with price history: ${assetSymbols.length} < 2. Assets with data: ${assetSymbols.join(', ')}`;
      console.error(`[Sharpe Optimization] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    console.log(`[Sharpe Optimization] Optimizing with ${assetSymbols.length} assets: ${assetSymbols.join(', ')}`);

    // Align all return series to same length (use minimum)
    const minLength = Math.min(
      ...Object.values(assetReturns).map((r) => r.length)
    );

    // Calculate mean returns WITH SHRINKAGE (using portfolio config)
    const meanReturns: number[] = [];
    for (const symbol of assetSymbols) {
      const returns = assetReturns[symbol].slice(-minLength); // Use last minLength returns
      const rawMean = returns.reduce((a, b) => a + b, 0) / returns.length;
      // Apply shrinkage factor from portfolio config
      const shrunkMean = rawMean * config.meanReturnShrinkage;
      meanReturns.push(shrunkMean);
    }

    // Calculate covariance matrix (no shrinkage on covariance)
    const covMatrix: number[][] = [];
    for (let i = 0; i < assetSymbols.length; i++) {
      covMatrix[i] = [];
      const returnsI = assetReturns[assetSymbols[i]].slice(-minLength);
      const meanI = returnsI.reduce((a, b) => a + b, 0) / returnsI.length; // Use raw mean for cov

      for (let j = 0; j < assetSymbols.length; j++) {
        const returnsJ = assetReturns[assetSymbols[j]].slice(-minLength);
        const meanJ = returnsJ.reduce((a, b) => a + b, 0) / returnsJ.length;

        let cov = 0;
        for (let k = 0; k < minLength; k++) {
          cov += (returnsI[k] - meanI) * (returnsJ[k] - meanJ);
        }
        covMatrix[i][j] = cov / (minLength - 1);
      }
    }

    // Build aligned returns matrix for alternative objectives (Sortino, Calmar, UPI)
    const returnsMatrix: number[][] = [];
    for (const symbol of assetSymbols) {
      returnsMatrix.push(assetReturns[symbol].slice(-minLength));
    }

    // Optimize using Nelder-Mead-like approach (more accurate than grid search)
    const optimalWeights = this.optimizeSharpeNelderMead(
      assetSymbols,
      meanReturns,
      covMatrix,
      returnsMatrix,
      config
    );

    // Build result object
    const result: Record<string, number> = {};
    for (let i = 0; i < assetSymbols.length; i++) {
      result[assetSymbols[i]] = optimalWeights[i];
    }

    // Fill in any missing assets with 0
    for (const symbol of Object.keys(targetWeights)) {
      if (!(symbol in result)) {
        result[symbol] = 0;
      }
    }

    return result;
  }

  /**
   * Nelder-Mead-like optimization for Sharpe ratio
   * More accurate than grid search, approximates scipy.optimize.minimize
   * Now uses portfolio configuration for constraints
   */
  private optimizeSharpeNelderMead(
    symbols: string[],
    meanReturns: number[],
    covMatrix: number[][],
    returnsMatrix: number[][],
    config: any
  ): number[] {
    const n = symbols.length;
    const minWeight = config.minWeight || 0.05;
    const maxWeight = config.maxWeight || 0.4;
    const leverage = config.leverageTarget || 2.5;
    const yearlyTradingDays = 252;
    const riskFreeRate = config.riskFreeRate || 0.02;
    const objective: string = config.optimizationObjective || "sharpe";

    console.log(`[Optimization] Objective: ${objective}, Constraints: minWeight=${minWeight}, maxWeight=${maxWeight}, leverage=${leverage}`);
    console.log(`[Optimization] Mean returns:`, meanReturns.map((r, i) => `${symbols[i]}: ${(r * 252 * 100).toFixed(2)}%`).join(', '));

    // Objective function: negative metric (to minimize)
    const negObjective = (weights: number[]): number => {
      // Normalize weights
      const sum = weights.reduce((a, b) => a + b, 0);
      if (sum <= 0) return Infinity;
      const w = weights.map((x) => x / sum);

      // Check constraints
      for (const weight of w) {
        if (weight < minWeight - 0.001 || weight > maxWeight + 0.001) {
          return Infinity; // Penalty for constraint violation
        }
      }

      switch (objective) {
        case "sortino":
          return -this.calculateLeveragedSortino(w, returnsMatrix, leverage, yearlyTradingDays, riskFreeRate);
        case "calmar":
          return -this.calculateCalmarRatio(w, returnsMatrix, leverage, yearlyTradingDays, riskFreeRate);
        case "ulcer":
          return -this.calculateUlcerPerformanceIndex(w, returnsMatrix, leverage, yearlyTradingDays, riskFreeRate);
        default:
          return -this.calculateLeveragedSharpe(w, meanReturns, covMatrix, leverage, yearlyTradingDays, riskFreeRate);
      }
    };

    // Initialize with equal weights
    let bestWeights = Array(n).fill(1 / n);
    let bestValue = negObjective(bestWeights);

    // Nelder-Mead parameters
    const alpha = 1.0; // Reflection
    const gamma = 2.0; // Expansion
    const rho = 0.5; // Contraction
    const sigma = 0.5; // Shrink
    const tolerance = 1e-8;
    const maxIterations = 500;

    // Initialize simplex
    const simplex: { point: number[]; value: number }[] = [];

    // First vertex: equal weights
    simplex.push({ point: [...bestWeights], value: bestValue });

    // Other vertices: perturb each dimension
    for (let i = 0; i < n; i++) {
      const point = [...bestWeights];
      point[i] = Math.min(maxWeight, point[i] + 0.05);
      // Normalize
      const sum = point.reduce((a, b) => a + b, 0);
      for (let j = 0; j < n; j++) point[j] /= sum;
      simplex.push({ point, value: negObjective(point) });
    }

    // Sort simplex
    simplex.sort((a, b) => a.value - b.value);

    for (let iter = 0; iter < maxIterations; iter++) {
      // Check convergence
      const range = simplex[n].value - simplex[0].value;
      if (range < tolerance) break;

      // Centroid of all points except worst
      const centroid = Array(n).fill(0);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          centroid[j] += simplex[i].point[j] / n;
        }
      }

      // Reflection
      const reflected = centroid.map(
        (c, j) => c + alpha * (c - simplex[n].point[j])
      );
      // Clamp to bounds
      for (let j = 0; j < n; j++) {
        reflected[j] = Math.max(0.01, Math.min(0.99, reflected[j]));
      }
      const reflectedValue = negObjective(reflected);

      if (reflectedValue < simplex[0].value) {
        // Expansion
        const expanded = centroid.map((c, j) => c + gamma * (reflected[j] - c));
        for (let j = 0; j < n; j++) {
          expanded[j] = Math.max(0.01, Math.min(0.99, expanded[j]));
        }
        const expandedValue = negObjective(expanded);

        if (expandedValue < reflectedValue) {
          simplex[n] = { point: expanded, value: expandedValue };
        } else {
          simplex[n] = { point: reflected, value: reflectedValue };
        }
      } else if (reflectedValue < simplex[n - 1].value) {
        simplex[n] = { point: reflected, value: reflectedValue };
      } else {
        // Contraction
        const contracted = centroid.map(
          (c, j) => c + rho * (simplex[n].point[j] - c)
        );
        const contractedValue = negObjective(contracted);

        if (contractedValue < simplex[n].value) {
          simplex[n] = { point: contracted, value: contractedValue };
        } else {
          // Shrink
          for (let i = 1; i <= n; i++) {
            for (let j = 0; j < n; j++) {
              simplex[i].point[j] =
                simplex[0].point[j] +
                sigma * (simplex[i].point[j] - simplex[0].point[j]);
            }
            simplex[i].value = negObjective(simplex[i].point);
          }
        }
      }

      // Re-sort simplex
      simplex.sort((a, b) => a.value - b.value);
    }

    // Get best solution
    bestWeights = simplex[0].point;
    bestValue = simplex[0].value;
    
    console.log(`[Optimization] Best value found: ${bestValue.toFixed(6)} (${objective}: ${(-bestValue).toFixed(6)})`);

    // Normalize and clamp to constraints
    let sum = bestWeights.reduce((a, b) => a + b, 0);
    if (sum <= 0) {
      console.warn(`[Optimization] Invalid weights sum: ${sum}, using equal weights`);
      bestWeights = Array(n).fill(1 / n);
    } else {
      bestWeights = bestWeights.map((w) => w / sum);
    }

    // Apply min/max constraints with redistribution
    let needsAdjustment = true;
    let iterations = 0;
    while (needsAdjustment && iterations < 10) {
      needsAdjustment = false;
      let excess = 0;
      // let deficitCount = 0; // Not currently used

      for (let i = 0; i < n; i++) {
        if (bestWeights[i] > maxWeight) {
          excess += bestWeights[i] - maxWeight;
          bestWeights[i] = maxWeight;
          needsAdjustment = true;
        } else if (bestWeights[i] < minWeight) {
          excess -= minWeight - bestWeights[i];
          bestWeights[i] = minWeight;
          needsAdjustment = true;
          // deficitCount++; // Not currently used
        }
      }

      // Redistribute excess
      if (excess !== 0) {
        const adjustable = bestWeights.filter(
          (w) => w > minWeight && w < maxWeight
        ).length;
        if (adjustable > 0) {
          const adjustment = excess / adjustable;
          for (let i = 0; i < n; i++) {
            if (bestWeights[i] > minWeight && bestWeights[i] < maxWeight) {
              bestWeights[i] -= adjustment;
            }
          }
        }
      }

      iterations++;
    }

    // Final normalization
    sum = bestWeights.reduce((a, b) => a + b, 0);
    const finalWeights = bestWeights.map((w) => w / sum);
    
    console.log(`[Optimization] Final weights (${objective}):`, finalWeights.map((w, i) => `${symbols[i]}: ${(w * 100).toFixed(2)}%`).join(', '));
    
    return finalWeights;
  }

  /**
   * Calculate leveraged Sharpe ratio
   * Matches the formula in BacktestHistorical.ipynb:
   * sharpe = (r_lever - risk_free_rate) / vol_lever
   * where r_lever = r_annual * leverage, vol_lever = vol_annual * leverage
   */
  private calculateLeveragedSharpe(
    weights: number[],
    meanReturns: number[],
    covMatrix: number[][],
    leverage: number,
    yearlyTradingDays: number,
    riskFreeRate: number
  ): number {
    // Portfolio daily return (already shrunk mean returns)
    let portReturnDaily = 0;
    for (let i = 0; i < weights.length; i++) {
      portReturnDaily += weights[i] * meanReturns[i];
    }

    // Portfolio daily variance: w' * Cov * w
    let portVarianceDaily = 0;
    for (let i = 0; i < weights.length; i++) {
      for (let j = 0; j < weights.length; j++) {
        portVarianceDaily += weights[i] * weights[j] * covMatrix[i][j];
      }
    }

    // Annualize
    const portReturnAnnual = portReturnDaily * yearlyTradingDays;
    const portVolAnnual = Math.sqrt(portVarianceDaily * yearlyTradingDays);

    // Apply leverage (THE CORE ASSUMPTION from notebook)
    const rLeveraged = portReturnAnnual * leverage;
    const volLeveraged = portVolAnnual * leverage;

    // Sharpe ratio
    if (volLeveraged <= 0) return 0;
    return (rLeveraged - riskFreeRate) / volLeveraged;
  }

  /**
   * Calculate leveraged Sortino ratio
   * Sortino = (R_leveraged - Rf) / DownsideDeviation_leveraged
   * Only penalizes negative volatility (downside risk)
   */
  private calculateLeveragedSortino(
    weights: number[],
    returnsMatrix: number[][],
    leverage: number,
    yearlyTradingDays: number,
    riskFreeRate: number
  ): number {
    const n = returnsMatrix[0].length; // number of days
    // Compute portfolio daily returns
    const portReturns: number[] = [];
    for (let t = 0; t < n; t++) {
      let r = 0;
      for (let i = 0; i < weights.length; i++) {
        r += weights[i] * returnsMatrix[i][t];
      }
      portReturns.push(r);
    }

    const meanReturn = portReturns.reduce((a, b) => a + b, 0) / n;
    const annualReturn = meanReturn * yearlyTradingDays * leverage;

    // Downside deviation: sqrt(mean(min(r, 0)^2)) * sqrt(252) * leverage
    let sumSquaredDownside = 0;
    for (const r of portReturns) {
      if (r < 0) {
        sumSquaredDownside += r * r;
      }
    }
    const downsideDeviation =
      Math.sqrt(sumSquaredDownside / n) * Math.sqrt(yearlyTradingDays) * leverage;

    if (downsideDeviation <= 0) return 0;
    return (annualReturn - riskFreeRate) / downsideDeviation;
  }

  /**
   * Calculate leveraged Calmar ratio
   * Calmar = CAGR_leveraged / |MaxDrawdown_leveraged|
   * Directly penalizes max drawdown
   */
  private calculateCalmarRatio(
    weights: number[],
    returnsMatrix: number[][],
    leverage: number,
    yearlyTradingDays: number,
    _riskFreeRate: number
  ): number {
    const n = returnsMatrix[0].length;
    // Simulate leveraged equity curve
    let equity = 1.0;
    let peak = 1.0;
    let maxDrawdown = 0;

    for (let t = 0; t < n; t++) {
      let r = 0;
      for (let i = 0; i < weights.length; i++) {
        r += weights[i] * returnsMatrix[i][t];
      }
      equity *= 1 + r * leverage;
      if (equity <= 0) return -Infinity; // Wipeout
      if (equity > peak) peak = equity;
      const dd = (equity - peak) / peak;
      if (dd < maxDrawdown) maxDrawdown = dd;
    }

    // CAGR: (finalEquity)^(252/n) - 1
    if (equity <= 0) return -Infinity;
    const cagr = Math.pow(equity, yearlyTradingDays / n) - 1;
    const absMaxDD = Math.abs(maxDrawdown);

    if (absMaxDD <= 0) return cagr > 0 ? Infinity : 0;
    return cagr / absMaxDD;
  }

  /**
   * Calculate Ulcer Performance Index (UPI)
   * UPI = (R_leveraged - Rf) / UlcerIndex
   * Penalizes both depth AND duration of drawdowns
   */
  private calculateUlcerPerformanceIndex(
    weights: number[],
    returnsMatrix: number[][],
    leverage: number,
    yearlyTradingDays: number,
    riskFreeRate: number
  ): number {
    const n = returnsMatrix[0].length;
    // Simulate leveraged equity curve
    let equity = 1.0;
    let peak = 1.0;
    let sumSquaredDD = 0;
    let meanReturn = 0;

    for (let t = 0; t < n; t++) {
      let r = 0;
      for (let i = 0; i < weights.length; i++) {
        r += weights[i] * returnsMatrix[i][t];
      }
      meanReturn += r;
      equity *= 1 + r * leverage;
      if (equity <= 0) return -Infinity;
      if (equity > peak) peak = equity;
      const ddPct = (equity - peak) / peak; // negative or zero
      sumSquaredDD += ddPct * ddPct;
    }

    meanReturn /= n;
    const annualReturn = meanReturn * yearlyTradingDays * leverage;
    const ulcerIndex = Math.sqrt(sumSquaredDD / n);

    if (ulcerIndex <= 0) return annualReturn > riskFreeRate ? Infinity : 0;
    return (annualReturn - riskFreeRate) / ulcerIndex;
  }

  /**
   * Calculate pending contribution (undeployed)
   * NOTE: Contributions are now marked as deployed immediately when registered,
   * so this should return 0 in normal operation
   */
  private calculatePendingContribution(contributions: any[]): number {
    return contributions
      .filter((c) => !c.deployed)
      .reduce((sum, c) => sum + c.amount, 0);
  }

  /**
   * Calculate target exposure based on leverage target
   * When rebalancing to increase exposure (leverage low), target leverageTarget
   * When rebalancing to decrease exposure (leverage high), target leverageMax
   */
  private calculateTargetExposure(
    equity: number,
    currentExposure: number,
    pendingContribution: number,
    deployFraction: number,
    config: any
  ): number {
    const leverageTarget = config.leverageTarget;
    const leverageMin = config.leverageMin;
    const leverageMax = config.leverageMax;
    const currentLeverage = equity > 0 ? currentExposure / equity : 0;

    // If leverage is below minimum, target leverageTarget (not just minimum)
    if (currentLeverage < leverageMin) {
      // Target exposure at leverageTarget
      return equity * leverageTarget;
    }

    // If leverage is above maximum, target leverageMax
    if (currentLeverage > leverageMax) {
      return equity * leverageMax;
    }

    // If leverage is in range, maintain current exposure (or adjust slightly if needed)
    // But if we're rebalancing, we might want to move towards target
    if (currentLeverage < leverageTarget) {
      // Move towards target
      return equity * leverageTarget;
    }

    // Otherwise, maintain current exposure
    return currentExposure;
  }

  /**
   * Calculate target positions for each asset.
   * When requireWholeShares is true, rounds stocks/ETFs to whole shares (Quantfury style).
   * When false (default), all assets are fractional (Trade Republic style).
   */
  private calculateTargetPositions(
    currentState: any,
    targetExposure: number,
    weights: Record<string, number>,
    assets: any[],
    latestPrices: Record<string, number>,
    requireWholeShares: boolean = false
  ): ProposalPosition[] {
    const positions: ProposalPosition[] = [];
    const { positionValues, positionQuantities, exposure } = currentState;

    for (const asset of assets) {
      const weight = weights[asset.symbol] || 0;
      if (weight === 0) continue;

      const price = latestPrices[asset.id] || 0;
      if (price === 0) continue;

      const currentValue = positionValues[asset.symbol] || 0;
      const currentQuantity = positionQuantities[asset.symbol] || 0;
      const currentWeight = exposure > 0 ? currentValue / exposure : 0;

      // Calculate raw target quantity
      let targetQuantity = (targetExposure * weight) / price;

      // When requireWholeShares is enabled, round non-fractional assets (stocks, ETFs,
      // commodities) to whole shares. Crypto and forex remain fractional regardless.
      const fractional = requireWholeShares
        ? isFractionalAsset(asset.symbol, asset.assetType)
        : true;
      if (!fractional) {
        targetQuantity = Math.round(targetQuantity);
      }

      // Recalculate target value based on (possibly rounded) quantity
      const targetValue = targetQuantity * price;

      const deltaQuantity = targetQuantity - currentQuantity;
      const deltaValue = targetValue - currentValue;

      // Adjust threshold for action based on whether fractional trading is used
      const threshold = fractional ? 0.0001 : 0.5;
      let action: "BUY" | "SELL" | "HOLD" = "HOLD";
      if (deltaQuantity > threshold) {
        action = "BUY";
      } else if (deltaQuantity < -threshold) {
        action = "SELL";
      }

      positions.push({
        assetId: asset.id,
        assetSymbol: asset.symbol,
        assetName: asset.name,
        assetType: asset.assetType || 'unknown',
        currentQuantity,
        currentValue,
        targetQuantity,
        targetValue,
        deltaQuantity,
        deltaValue,
        targetWeight: weight,
        currentWeight,
        currentPrice: price,
        action,
      });
    }

    return positions;
  }

  /**
   * Calculate equity/borrow breakdown
   * NOTE: When rebalancing to increase exposure, equity doesn't change.
   * All exposure increase comes from additional borrowing.
   * Contributions go directly to equity when registered, so we ignore pending contributions
   * (they're already included in the current equity).
   */
  private calculateEquityBorrowBreakdown(
    currentExposure: number,
    targetExposure: number,
    currentEquity: number,
    _config: any
  ): { equityUsed: number; borrowIncrease: number } {
    const netExposureChange = targetExposure - currentExposure;

    // Formula: exposure = equity + borrowed_amount
    // Equity stays constant during rebalance, so:
    //   borrowed_amount = max(0, exposure - equity)
    // When equity > exposure, there's no borrowing (equity is partially undeployed).
    const currentBorrowed = Math.max(0, currentExposure - currentEquity);
    const newBorrowed = Math.max(0, targetExposure - currentEquity);

    const borrowIncrease = newBorrowed - currentBorrowed;
    const equityUsed = netExposureChange - borrowIncrease;

    return { equityUsed, borrowIncrease };
  }

  /**
   * Accept and save a rebalance proposal
   * @param portfolioId - Portfolio ID
   * @param proposal - The accepted proposal
   */
  async acceptProposal(
    portfolioId: string,
    proposal: RebalanceProposal,
    executionPrices?: Record<string, number>
  ): Promise<{ success: boolean; message: string }> {
    // Create rebalance event
    const rebalanceEvent = await this.prisma.rebalanceEvent.create({
      data: {
        portfolioId,
        triggeredBy: "user",
        targetLeverage: proposal.targetLeverage,
      },
    });

    // If execution prices are provided, recalculate exposure-based values
    // so metrics reflect actual broker prices, not Yahoo mark prices
    let adjustedExposure = proposal.summary.newExposure;
    if (executionPrices && Object.keys(executionPrices).length > 0) {
      // Recalculate total exposure from actual execution prices
      adjustedExposure = 0;
      for (const pos of proposal.positions) {
        const execPrice = executionPrices[pos.assetId] ?? pos.currentPrice;
        adjustedExposure += pos.targetQuantity * execPrice;
      }
    }

    // Save rebalance positions and update portfolio positions
    for (const pos of proposal.positions) {
      // Use execution price if provided, otherwise fall back to mark price
      const effectivePrice = executionPrices?.[pos.assetId] ?? pos.currentPrice;
      const effectiveTargetValue = pos.targetQuantity * effectivePrice;

      // Save rebalance position record
      await this.prisma.rebalancePosition.create({
        data: {
          rebalanceEventId: rebalanceEvent.id,
          assetId: pos.assetId,
          targetWeight: pos.targetWeight,
          targetUsd: effectiveTargetValue,
          deltaQuantity: pos.deltaQuantity,
        },
      });

      // Update portfolio position with weighted average price
      // BUY: newAvgPrice = (oldQty * oldAvgPrice + deltaQty * effectivePrice) / newQty
      // SELL: avgPrice stays the same (cost basis doesn't change on sells)
      // NEW: avgPrice = effectivePrice
      let updatedAvgPrice = effectivePrice;
      if (pos.action === "BUY" && pos.currentQuantity > 0) {
        // Fetch stored avgPrice (cost basis) from DB — don't use currentValue/currentQuantity
        // which gives market price and would reset PnL to zero on every rebalance
        const existingPosition =
          await this.prisma.portfolioPosition.findUnique({
            where: {
              portfolioId_assetId: {
                portfolioId,
                assetId: pos.assetId,
              },
            },
            select: { avgPrice: true },
          });
        const storedAvgPrice = existingPosition?.avgPrice || effectivePrice;
        updatedAvgPrice =
          (pos.currentQuantity * storedAvgPrice +
            pos.deltaQuantity * effectivePrice) /
          pos.targetQuantity;
      }

      await this.prisma.portfolioPosition.upsert({
        where: {
          portfolioId_assetId: {
            portfolioId,
            assetId: pos.assetId,
          },
        },
        create: {
          portfolioId,
          assetId: pos.assetId,
          quantity: pos.targetQuantity,
          avgPrice: effectivePrice,
          exposureUsd: effectiveTargetValue,
        },
        update: {
          quantity: pos.targetQuantity,
          ...(pos.action !== "SELL" && { avgPrice: updatedAvgPrice }),
          exposureUsd: effectiveTargetValue,
        },
      });
    }

    // Recalculate equity and leverage from adjusted exposure
    // borrowedAmount stays the same as proposed; equity shifts with exposure difference
    const originalBorrowed = proposal.summary.newExposure - proposal.summary.newEquity;
    const adjustedEquity = adjustedExposure - originalBorrowed;
    const adjustedLeverage = adjustedEquity > 0 ? adjustedExposure / adjustedEquity : 0;

    // Save metrics snapshot with metadata for dashboard tracing
    const pnl =
      adjustedEquity -
      proposal.currentEquity -
      proposal.pendingContribution;
    const pnlPercent =
      proposal.currentEquity > 0 ? (pnl / proposal.currentEquity) * 100 : 0;
    const composition = proposal.positions.map((pos) => {
      const execPrice = executionPrices?.[pos.assetId] ?? pos.currentPrice;
      return {
        symbol: pos.assetSymbol,
        name: pos.assetName,
        weight: pos.targetWeight,
        value: pos.targetQuantity * execPrice,
        delta: pos.deltaValue,
        action: pos.action,
      };
    });

    // Get today's date in UTC to avoid timezone issues
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    // Get existing metric to preserve metadata arrays
    const existingMetric = await this.prisma.metricsTimeseries.findFirst({
      where: {
        portfolioId,
        date: today,
      },
    });

    // Build metadata: add rebalance to rebalances array, preserve other arrays
    let metadata: any = {
      source: "rebalance",
      updatedAt: new Date().toISOString(),
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
        } else {
          metadata.rebalances = [];
        }
        if (existingMetadata.manualUpdates) {
          metadata.manualUpdates = existingMetadata.manualUpdates;
        }
        // Preserve other fields
        if (existingMetadata.source) {
          metadata.source = existingMetadata.source;
        }
      } catch {
        // If parsing fails, start fresh
        metadata.rebalances = [];
      }
    } else {
      metadata.rebalances = [];
    }

    // Add new rebalance to the array
    metadata.rebalances.push({
      pnl,
      pnlPercent,
      contribution: proposal.pendingContribution,
      deployFraction: proposal.deployFraction,
      drawdown: proposal.drawdown,
      weightDeviation: proposal.weightDeviation,
      realizedVolatility: proposal.realizedVolatility,
      weightsUsed: proposal.weightsUsed,
      dynamicWeights: proposal.dynamicWeightsComputed,
      composition,
      rebalancedAt: new Date().toISOString(),
    });

    // Use upsert to avoid unique constraint errors if entry already exists for today
    const borrowedAmount = adjustedExposure - adjustedEquity;
    await this.prisma.metricsTimeseries.upsert({
      where: {
        portfolioId_date: {
          portfolioId,
          date: today,
        },
      },
      create: {
        portfolioId,
        date: today,
        equity: adjustedEquity,
        exposure: adjustedExposure,
        leverage: adjustedLeverage,
        borrowedAmount,
        drawdown: proposal.drawdown,
        marginRatio: adjustedEquity > 0
          ? adjustedEquity / adjustedExposure
          : 1,
        metadataJson: JSON.stringify(metadata),
      },
      update: {
        equity: adjustedEquity,
        exposure: adjustedExposure,
        leverage: adjustedLeverage,
        borrowedAmount,
        drawdown: proposal.drawdown,
        marginRatio: adjustedEquity > 0
          ? adjustedEquity / adjustedExposure
          : 1,
        metadataJson: JSON.stringify(metadata),
      },
    });

    return {
      success: true,
      message: "Simulation applied and portfolio updated",
    };
  }

  /**
   * Get latest prices for assets
   * @param assetIds - Array of asset IDs
   * @returns Map of assetId to latest price
   */
  private async getLatestPrices(
    assets: { id: string; symbol: string }[]
  ): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};

    // Fetch real-time prices from Yahoo Finance, fall back to DB stored prices
    for (const asset of assets) {
      const livePrice = await this.fetchLivePrice(asset.symbol);
      if (livePrice) {
        prices[asset.id] = livePrice;
      } else {
        const storedPrice = await this.prisma.assetPrice.findFirst({
          where: { assetId: asset.id },
          orderBy: { date: "desc" },
        });
        if (storedPrice) {
          prices[asset.id] = storedPrice.close;
          console.warn(
            `[RebalanceService] Using stored price for ${asset.symbol}: ${storedPrice.close}`
          );
        }
      }
    }

    return prices;
  }

  private async fetchLivePrice(symbol: string): Promise<number | null> {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });

      if (!response.ok) {
        console.error(
          `[RebalanceService] Failed to fetch live price for ${symbol}: HTTP ${response.status}`
        );
        return null;
      }

      const data = await response.json();
      const price = data.chart?.result?.[0]?.meta?.regularMarketPrice;

      if (price && price > 0) {
        console.log(
          `[RebalanceService] Live price for ${symbol}: ${price}`
        );
        return price;
      }

      return null;
    } catch (error) {
      console.error(
        `[RebalanceService] Error fetching live price for ${symbol}:`,
        error
      );
      return null;
    }
  }
}
