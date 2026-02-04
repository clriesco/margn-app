/**
 * Backtest orchestrator
 * Generates rolling windows, runs simulations, aggregates results
 */

import type {
  BacktestConfig, PriceData, BacktestProgress,
  BacktestResult, WindowMetrics, WindowTrajectory, PortfolioState,
} from '../types';
import { calculateReturnsAndCovariance, optimizeSharpeNelderMead } from './optimizer';
import { createInitialState, simulateDay } from './portfolio-sim';
import { rebalancePortfolio, type RebalanceParams } from './rebalancer';
import { calculateWindowMetrics, selectPercentileWindow } from './metrics';

/**
 * Generate rolling window start indices
 * Each window starts 1 month (~21 trading days) apart
 */
export function generateRollingWindows(
  totalDays: number,
  windowDays: number,
  stepDays: number = 21
): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  for (let start = 0; start + windowDays <= totalDays; start += stepDays) {
    windows.push({ start, end: start + windowDays - 1 });
  }
  return windows;
}

/**
 * Convert PriceData (symbol -> {date: price}) to aligned arrays.
 *
 * If including all symbols produces fewer common dates than required
 * (`minCommonDays`), iteratively removes the symbol with the fewest
 * dates until the common date count is acceptable or only one symbol remains.
 */
export function alignPrices(
  priceData: PriceData,
  symbols: string[],
  minCommonDays: number = 0
): { prices: Record<string, number[]>; dates: string[]; excludedSymbols: string[] } {
  const excluded: string[] = [];
  let kept = [...symbols];

  function computeCommonDates(syms: string[]): string[] {
    const dateSets = syms.map((s) => new Set(Object.keys(priceData[s] || {})));
    return [...dateSets[0]].filter((d) => dateSets.every((set) => set.has(d))).sort();
  }

  let commonDates = computeCommonDates(kept);

  // Iteratively drop the symbol with fewest dates if common dates are below threshold
  while (commonDates.length < minCommonDays && kept.length > 1) {
    // Find which symbol has fewest raw dates
    let worstIdx = 0;
    let worstCount = Object.keys(priceData[kept[0]] || {}).length;
    for (let i = 1; i < kept.length; i++) {
      const count = Object.keys(priceData[kept[i]] || {}).length;
      if (count < worstCount) {
        worstCount = count;
        worstIdx = i;
      }
    }

    const removed = kept.splice(worstIdx, 1)[0];
    const newCommon = computeCommonDates(kept);

    // Only accept removal if it actually improves common dates
    if (newCommon.length > commonDates.length) {
      excluded.push(removed);
      commonDates = newCommon;
    } else {
      // Put it back — removing didn't help
      kept.splice(worstIdx, 0, removed);
      break;
    }
  }

  const prices: Record<string, number[]> = {};
  for (const symbol of kept) {
    prices[symbol] = commonDates.map((d) => priceData[symbol][d]);
  }

  return { prices, dates: commonDates, excludedSymbols: excluded };
}

/**
 * Main backtest runner
 */
export function runBacktest(
  config: BacktestConfig,
  priceData: PriceData,
  onProgress?: (progress: BacktestProgress) => void
): BacktestResult {
  let { symbols } = config;

  // 1. Filter out symbols with no price data and report per-symbol coverage
  const symbolDayCounts: Record<string, number> = {};
  for (const s of symbols) {
    symbolDayCounts[s] = Object.keys(priceData[s] || {}).length;
  }

  const emptySymbols = symbols.filter((s) => symbolDayCounts[s] === 0);
  if (emptySymbols.length > 0 && emptySymbols.length < symbols.length) {
    // Drop symbols with no data and continue
    symbols = symbols.filter((s) => symbolDayCounts[s] > 0);
    console.warn(
      `[Backtest] Activos sin datos de precios: ${emptySymbols.join(', ')}`
    );
  } else if (emptySymbols.length === symbols.length) {
    throw new Error(
      'Ningún activo tiene datos de precios. Verifica que los tickers son correctos.'
    );
  }

  // 1b. Align prices to common dates, dropping assets with insufficient history
  const windowDays = Math.round(config.windowMonths * 21);
  const { prices, dates, excludedSymbols } = alignPrices(priceData, symbols, windowDays);

  if (excludedSymbols.length > 0) {
    // Remove excluded symbols from the working set
    symbols = symbols.filter((s) => !excludedSymbols.includes(s));
    console.warn(
      `[Backtest] Activos excluidos por fechas insuficientes: ${excludedSymbols.join(', ')}`
    );
  }

  const totalDays = dates.length;

  // If alignment results in insufficient data, give a detailed diagnostic
  if (totalDays === 0) {
    const allSymbols = [...symbols, ...excludedSymbols];
    const ranges = allSymbols.map((s) => {
      const d = Object.keys(priceData[s] || {}).sort();
      return `${s}: ${d.length} días (${d[0] || '—'} a ${d[d.length - 1] || '—'})`;
    });
    throw new Error(
      'No hay fechas comunes entre los activos seleccionados. ' +
      'Revisa que los rangos de fechas se solapen.\n\n' +
      ranges.join('\n')
    );
  }

  // 2. Determine weights (only for kept symbols; renormalize if some were excluded)
  let weightsUsed: Record<string, number>;

  if (config.weightMode === 'manual' && config.manualWeights) {
    // Keep only weights for surviving symbols and renormalize
    const kept: Record<string, number> = {};
    let sum = 0;
    for (const s of symbols) {
      kept[s] = config.manualWeights[s] ?? 0;
      sum += kept[s];
    }
    weightsUsed = {};
    for (const s of symbols) weightsUsed[s] = sum > 0 ? kept[s] / sum : 1 / symbols.length;
  } else if (config.weightMode === 'equal') {
    weightsUsed = {};
    for (const s of symbols) weightsUsed[s] = 1 / symbols.length;
  } else {
    // Sharpe optimization using all available price data
    onProgress?.({
      stage: 'optimizing', windowsCompleted: 0, totalWindows: 0, percent: 0,
    });

    const pricesBySymbol: Record<string, number[]> = {};
    for (const s of symbols) pricesBySymbol[s] = prices[s];

    const { meanReturns, covMatrix } = calculateReturnsAndCovariance(
      pricesBySymbol, symbols, config.meanReturnShrinkage
    );

    const optWeights = optimizeSharpeNelderMead(meanReturns, covMatrix, {
      leverage: config.leverageTarget,
      riskFreeRate: config.riskFreeRate,
      minWeight: config.minWeight,
      maxWeight: config.maxWeight,
      meanReturnShrinkage: config.meanReturnShrinkage,
    });

    weightsUsed = {};
    for (let i = 0; i < symbols.length; i++) {
      weightsUsed[symbols[i]] = optWeights[i];
    }
  }

  // 3. Generate rolling windows
  const windows = generateRollingWindows(totalDays, windowDays);

  if (windows.length === 0) {
    const ranges = symbols.map((s) => {
      const d = Object.keys(priceData[s] || {}).sort();
      return `${s}: ${d.length} días (${d[0] || '—'} a ${d[d.length - 1] || '—'})`;
    });
    throw new Error(
      `Datos insuficientes para ventanas de ${config.windowMonths} meses. ` +
      `Hay ${totalDays} días comunes, se necesitan ${windowDays}.\n\n` +
      `Datos por activo:\n${ranges.join('\n')}\n\n` +
      `Prueba con un rango de fechas más amplio o ventanas más cortas.`
    );
  }

  onProgress?.({
    stage: 'simulating', windowsCompleted: 0, totalWindows: windows.length, percent: 0,
  });

  // 4. Simulate each window
  const allMetrics: WindowMetrics[] = [];
  const allTrajectories: WindowTrajectory[] = [];

  const rebalanceParams: RebalanceParams = {
    leverageMin: config.leverageMin,
    leverageMax: config.leverageMax,
    leverageTarget: config.leverageTarget,
    maintenanceMarginRatio: config.maintenanceMarginRatio,
  };

  for (let w = 0; w < windows.length; w++) {
    const { start } = windows[w];

    // Initial prices at window start
    const initialPrices: Record<string, number> = {};
    for (const s of symbols) initialPrices[s] = prices[s][start];

    let state = createInitialState(
      config.initialCapital,
      config.leverageTarget,
      weightsUsed,
      initialPrices,
      dates[start]
    );

    const states: PortfolioState[] = [state];
    const contributions: number[] = [];
    let totalContributed = 0;
    let tradingDayInMonth = 0;

    // Simulate day by day
    for (let d = 1; d < windowDays && start + d < totalDays; d++) {
      // Apply daily returns
      const returns: Record<string, number> = {};
      for (const s of symbols) {
        const prev = prices[s][start + d - 1];
        const curr = prices[s][start + d];
        returns[s] = prev > 0 ? curr / prev - 1 : 0;
      }

      state = simulateDay(state, returns, dates[start + d], config.maintenanceMarginRatio);
      tradingDayInMonth++;

      // Monthly rebalance (~21 trading days)
      if (tradingDayInMonth >= 21) {
        tradingDayInMonth = 0;
        const currentPrices: Record<string, number> = {};
        for (const s of symbols) currentPrices[s] = prices[s][start + d];

        // Re-optimize weights if dynamic weights enabled
        let currentWeights = weightsUsed;
        if (config.dynamicWeights && config.weightMode === 'sharpe') {
          const lookbackDays = (config.dynamicWeightsLookback || 12) * 21;
          const lookbackStart = Math.max(0, start + d - lookbackDays);
          const lookbackEnd = start + d;

          // Extract price data for the lookback window
          const lookbackPrices: Record<string, number[]> = {};
          for (const s of symbols) {
            lookbackPrices[s] = prices[s].slice(lookbackStart, lookbackEnd + 1);
          }

          // Only re-optimize if we have enough data (at least 63 days)
          if (lookbackPrices[symbols[0]].length >= 63) {
            try {
              const { meanReturns, covMatrix } = calculateReturnsAndCovariance(
                lookbackPrices, symbols, config.meanReturnShrinkage
              );

              const optWeights = optimizeSharpeNelderMead(meanReturns, covMatrix, {
                leverage: config.leverageTarget,
                riskFreeRate: config.riskFreeRate,
                minWeight: config.minWeight,
                maxWeight: config.maxWeight,
                meanReturnShrinkage: config.meanReturnShrinkage,
              });

              currentWeights = {};
              for (let i = 0; i < symbols.length; i++) {
                currentWeights[symbols[i]] = optWeights[i];
              }
            } catch {
              // Keep previous weights if optimization fails
            }
          }
        }

        const equityHistory = states.map((s) => s.equity);
        const result = rebalancePortfolio(
          state,
          config.monthlyContribution,
          currentWeights,
          equityHistory,
          currentPrices,
          rebalanceParams
        );

        state = result.newState;
        totalContributed += config.monthlyContribution;
        contributions.push(config.monthlyContribution);
      }

      states.push(state);
      if (state.marginCall) break;
    }

    const metrics = calculateWindowMetrics(
      states, totalContributed, config.riskFreeRate,
      w, dates[start], dates[Math.min(start + windowDays - 1, totalDays - 1)]
    );

    allMetrics.push(metrics);
    allTrajectories.push({
      states,
      contributions,
      startDate: dates[start],
      endDate: dates[Math.min(start + windowDays - 1, totalDays - 1)],
    });

    // Report progress
    if (onProgress && (w % 5 === 0 || w === windows.length - 1)) {
      const partialP50 = allMetrics.length >= 3
        ? selectPercentileWindow(allMetrics, 0.5)
        : undefined;

      onProgress({
        stage: 'simulating',
        windowsCompleted: w + 1,
        totalWindows: windows.length,
        percent: Math.round(((w + 1) / windows.length) * 100),
        partialP50,
      });
    }
  }

  // 5. Aggregate results
  onProgress?.({
    stage: 'aggregating', windowsCompleted: windows.length,
    totalWindows: windows.length, percent: 100,
  });

  const p10 = selectPercentileWindow(allMetrics, 0.1);
  const p50 = selectPercentileWindow(allMetrics, 0.5);
  const p90 = selectPercentileWindow(allMetrics, 0.9);
  const marginCallCount = allMetrics.filter((m) => m.marginCall).length;

  // Combine all excluded symbols (no data + insufficient dates)
  const allExcluded = [...emptySymbols, ...excludedSymbols];

  return {
    config,
    weightsUsed,
    windows: allMetrics,
    p10, p50, p90,
    totalWindows: allMetrics.length,
    marginCallCount,
    trajectories: allTrajectories,
    excludedSymbols: allExcluded.length > 0 ? allExcluded : undefined,
  };
}
