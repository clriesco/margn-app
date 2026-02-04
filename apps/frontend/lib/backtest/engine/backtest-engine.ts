/**
 * Backtest orchestrator
 * Generates rolling windows, runs simulations, aggregates results
 */

import type {
  BacktestConfig, PriceData, BacktestProgress,
  BacktestResult, WindowMetrics, WindowTrajectory, PortfolioState,
  SymbolDateRange, DataCoverageInfo,
} from '../types';
import { calculateReturnsAndCovariance, optimizeSharpeNelderMead } from './optimizer';
import { createInitialState, simulateDay } from './portfolio-sim';
import { rebalancePortfolio, type RebalanceParams } from './rebalancer';
import { calculateWindowMetrics, selectPercentileWindow } from './metrics';

/**
 * Add months to a date (calendar months)
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Binary search to find first index where dates[i] >= targetDate
 */
function findFirstDateIndex(dates: string[], targetDate: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid] < targetDate) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Binary search to find last index where dates[i] <= targetDate
 */
function findLastDateIndex(dates: string[], targetDate: string): number {
  let lo = 0, hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid] <= targetDate) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Generate rolling windows based on calendar months.
 * Each window spans `windowMonths` calendar months, stepping 1 month at a time.
 * Returns indices into the dates array for the first trading day >= window start
 * and last trading day <= window end.
 */
export function generateRollingWindows(
  dates: string[],
  windowMonths: number
): { start: number; end: number; startDate: string; endDate: string }[] {
  if (dates.length === 0) return [];

  const windows: { start: number; end: number; startDate: string; endDate: string }[] = [];

  // Parse first and last available dates (ensure consistent local time parsing)
  const firstDateStr = dates[0];
  const lastDateStr = dates[dates.length - 1];
  const firstDate = new Date(firstDateStr + 'T00:00:00');
  const lastDate = new Date(lastDateStr + 'T00:00:00');

  // Start from the first day of the month of the first available date
  let windowStart = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);

  while (true) {
    // Window end is windowMonths later, last day of that month
    const windowEndMonth = addMonths(windowStart, windowMonths);
    windowEndMonth.setDate(0); // Last day of previous month = last day of window

    // If window end exceeds our data, stop
    if (windowEndMonth > lastDate) break;

    // Format dates for comparison (YYYY-MM-DD)
    const startStr = windowStart.toISOString().slice(0, 10);
    const endStr = windowEndMonth.toISOString().slice(0, 10);

    // Find actual trading day indices
    const startIdx = findFirstDateIndex(dates, startStr);
    const endIdx = findLastDateIndex(dates, endStr);

    // Only add if we have valid indices
    if (startIdx < dates.length && endIdx >= 0 && startIdx <= endIdx) {
      // Verify the window isn't truncated: actual end date should be within 7 days of expected
      const actualEndDate = new Date(dates[endIdx] + 'T00:00:00');
      const daysDiff = Math.abs(windowEndMonth.getTime() - actualEndDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysDiff <= 7) {
        windows.push({
          start: startIdx,
          end: endIdx,
          startDate: dates[startIdx],
          endDate: dates[endIdx],
        });
      }
    }

    // Move to next month
    windowStart = addMonths(windowStart, 1);
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
  const originalSymbols = [...symbols];

  // 1. Collect date range info for ALL symbols (for diagnostics)
  const symbolRanges: SymbolDateRange[] = [];
  const symbolDayCounts: Record<string, number> = {};

  for (const s of symbols) {
    const dates = Object.keys(priceData[s] || {}).sort();
    symbolDayCounts[s] = dates.length;
    symbolRanges.push({
      symbol: s,
      firstDate: dates[0] || '—',
      lastDate: dates[dates.length - 1] || '—',
      dayCount: dates.length,
    });
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
  // Estimate minimum days needed: ~21 trading days per month
  const minDaysNeeded = Math.round(config.windowMonths * 21);
  const { prices, dates, excludedSymbols } = alignPrices(priceData, symbols, minDaysNeeded);

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

  // 3. Generate rolling windows (calendar months)
  const windows = generateRollingWindows(dates, config.windowMonths);

  if (windows.length === 0) {
    const ranges = symbols.map((s) => {
      const d = Object.keys(priceData[s] || {}).sort();
      return `${s}: ${d.length} días (${d[0] || '—'} a ${d[d.length - 1] || '—'})`;
    });
    throw new Error(
      `Datos insuficientes para ventanas de ${config.windowMonths} meses. ` +
      `Rango disponible: ${dates[0]} a ${dates[dates.length - 1]}.\n\n` +
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
    const { start, end, startDate, endDate } = windows[w];

    // Initial prices at window start
    const initialPrices: Record<string, number> = {};
    for (const s of symbols) initialPrices[s] = prices[s][start];

    let state = createInitialState(
      config.initialCapital,
      config.leverageTarget,
      weightsUsed,
      initialPrices,
      startDate
    );

    const states: PortfolioState[] = [state];
    const contributions: number[] = [];
    let totalContributed = 0;
    let tradingDayInMonth = 0;

    // Simulate day by day within the window
    for (let idx = start + 1; idx <= end; idx++) {
      // Apply daily returns
      const returns: Record<string, number> = {};
      for (const s of symbols) {
        const prev = prices[s][idx - 1];
        const curr = prices[s][idx];
        returns[s] = prev > 0 ? curr / prev - 1 : 0;
      }

      state = simulateDay(state, returns, dates[idx], config.maintenanceMarginRatio);
      tradingDayInMonth++;

      // Monthly rebalance (~21 trading days)
      if (tradingDayInMonth >= 21) {
        tradingDayInMonth = 0;
        const currentPrices: Record<string, number> = {};
        for (const s of symbols) currentPrices[s] = prices[s][idx];

        // Re-optimize weights if dynamic weights enabled
        let currentWeights = weightsUsed;
        if (config.dynamicWeights && config.weightMode === 'sharpe') {
          const lookbackDays = (config.dynamicWeightsLookback || 12) * 21;
          const lookbackStart = Math.max(0, idx - lookbackDays);
          const lookbackEnd = idx;

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
      w, startDate, endDate
    );

    allMetrics.push(metrics);
    allTrajectories.push({
      states,
      contributions,
      startDate,
      endDate,
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

  // 6. Calculate data coverage info
  // Find max possible windows based on calendar months (not trading days)
  // Use the symbol with the widest date range
  const validRanges = symbolRanges.filter((r) => r.firstDate !== '—' && r.lastDate !== '—');
  let maxPossibleWindows = windows.length;

  if (validRanges.length > 0) {
    const earliestFirst = validRanges.reduce((min, r) => r.firstDate < min ? r.firstDate : min, validRanges[0].firstDate);
    const latestLast = validRanges.reduce((max, r) => r.lastDate > max ? r.lastDate : max, validRanges[0].lastDate);

    // Calculate months between earliest first and latest last
    const startDate = new Date(earliestFirst);
    const endDate = new Date(latestLast);
    const totalMonths = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth());

    // Max windows = total months - window months + 1 (if positive)
    maxPossibleWindows = Math.max(0, totalMonths - config.windowMonths + 1);
  }

  // Identify limiting symbols (those whose date range actually constrains the common range)
  // Use a tolerance of 10 days to account for holidays/weekends (crypto trades 365, stocks don't)
  const LIMITING_TOLERANCE_DAYS = 10;
  const limitingSymbols: string[] = [];

  if (symbols.length > 0 && dates.length > 0) {
    const includedRanges = symbolRanges.filter((r) => !allExcluded.includes(r.symbol));

    if (includedRanges.length > 1) {
      // Find the symbol(s) with the LATEST first date (they limit the start)
      const sortedByFirstDate = [...includedRanges].sort((a, b) => a.firstDate.localeCompare(b.firstDate));
      const latestFirstDate = sortedByFirstDate[sortedByFirstDate.length - 1].firstDate;
      const earliestFirstDate = sortedByFirstDate[0].firstDate;

      // Find the symbol(s) with the EARLIEST last date (they limit the end)
      const sortedByLastDate = [...includedRanges].sort((a, b) => a.lastDate.localeCompare(b.lastDate));
      const earliestLastDate = sortedByLastDate[0].lastDate;
      const latestLastDate = sortedByLastDate[sortedByLastDate.length - 1].lastDate;

      // Helper to calculate day difference between two date strings
      const dayDiff = (d1: string, d2: string) => {
        const t1 = new Date(d1).getTime();
        const t2 = new Date(d2).getTime();
        return Math.abs(t2 - t1) / (1000 * 60 * 60 * 24);
      };

      // Mark symbols as limiting if they significantly constrain the range
      for (const r of includedRanges) {
        const isLimitingStart = r.firstDate === latestFirstDate &&
          dayDiff(earliestFirstDate, latestFirstDate) > LIMITING_TOLERANCE_DAYS;
        const isLimitingEnd = r.lastDate === earliestLastDate &&
          dayDiff(earliestLastDate, latestLastDate) > LIMITING_TOLERANCE_DAYS;

        if (isLimitingStart || isLimitingEnd) {
          limitingSymbols.push(r.symbol);
        }
      }
    }
  }

  // Build coverage info if there are limitations
  let dataCoverage: DataCoverageInfo | undefined;
  if (windows.length < maxPossibleWindows || allExcluded.length > 0 || limitingSymbols.length > 0) {
    dataCoverage = {
      symbolRanges,
      commonFirstDate: dates[0] || '—',
      commonLastDate: dates[dates.length - 1] || '—',
      commonDayCount: totalDays,
      maxPossibleWindows,
      limitingSymbols,
    };
  }

  return {
    config,
    weightsUsed,
    windows: allMetrics,
    p10, p50, p90,
    totalWindows: allMetrics.length,
    marginCallCount,
    trajectories: allTrajectories,
    excludedSymbols: allExcluded.length > 0 ? allExcluded : undefined,
    dataCoverage,
  };
}
