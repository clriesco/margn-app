/**
 * Backtest engine types
 * All interfaces for the browser-side backtest computation
 */

export interface BacktestConfig {
  symbols: string[];
  initialCapital: number;
  monthlyContribution: number;
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  windowMonths: number; // 36, 48, 60, 72, 84
  weightMode: 'sharpe' | 'manual' | 'equal';
  manualWeights?: Record<string, number>;
  /** Re-optimize weights monthly using rolling window (only for sharpe mode) */
  dynamicWeights?: boolean;
  /** Lookback months for dynamic weight optimization */
  dynamicWeightsLookback?: number;
  // Sharpe optimization params
  meanReturnShrinkage: number;
  riskFreeRate: number;
  maxWeight: number;
  minWeight: number;
  // Risk params
  maintenanceMarginRatio: number;
}

export interface PriceData {
  /** symbol -> date string (YYYY-MM-DD) -> close price */
  [symbol: string]: Record<string, number>;
}

export interface PortfolioState {
  day: number;
  date: string;
  equity: number;
  exposure: number;
  leverage: number;
  borrowedAmount: number;
  positions: Record<string, { quantity: number; value: number }>;
  peakEquity: number;
  marginRatio: number;
  marginCall: boolean;
}

export interface DailyReturn {
  [symbol: string]: number;
}

export interface DeploySignals {
  drawdownTriggered: boolean;
  weightDeviationTriggered: boolean;
  volatilityTriggered: boolean;
  deployFraction: number;
  drawdown: number;
  weightDeviation: number;
  realizedVolatility: number | null;
}

export interface RebalanceResult {
  newState: PortfolioState;
  deployed: number;
  borrowChange: number;
  signals: DeploySignals;
  reborrowed?: boolean;
}

export interface WindowTrajectory {
  states: PortfolioState[];
  contributions: number[];
  startDate: string;
  endDate: string;
}

export interface WindowMetrics {
  windowIndex: number;
  startDate: string;
  endDate: string;
  finalCapital: number;
  totalContributed: number;
  absoluteReturn: number;
  returnPercent: number;
  cagr: number;
  sharpe: number;
  maxDrawdownEquity: number;
  recoveryDays: number;
  underwaterDays: number;
  marginCall: boolean;
  finalLeverage: number;
}

/** Per-symbol date range information */
export interface SymbolDateRange {
  symbol: string;
  firstDate: string;
  lastDate: string;
  dayCount: number;
}

/** Information about data coverage and limitations */
export interface DataCoverageInfo {
  /** Date range info for each symbol (including excluded) */
  symbolRanges: SymbolDateRange[];
  /** Common date range after alignment */
  commonFirstDate: string;
  commonLastDate: string;
  commonDayCount: number;
  /** Maximum possible windows if all data was available */
  maxPossibleWindows: number;
  /** The symbol(s) limiting the common range */
  limitingSymbols: string[];
}

export interface BacktestResult {
  config: BacktestConfig;
  weightsUsed: Record<string, number>;
  windows: WindowMetrics[];
  p10: WindowMetrics;
  p50: WindowMetrics;
  p90: WindowMetrics;
  totalWindows: number;
  marginCallCount: number;
  trajectories: WindowTrajectory[];
  /** Symbols excluded from the backtest due to insufficient date coverage */
  excludedSymbols?: string[];
  /** Data coverage information - present when there are limitations */
  dataCoverage?: DataCoverageInfo;
}

export interface BacktestProgress {
  stage: 'optimizing' | 'simulating' | 'aggregating' | 'done';
  windowsCompleted: number;
  totalWindows: number;
  percent: number;
  partialP50?: WindowMetrics;
}

/** Messages from main thread to worker */
export interface WorkerRequest {
  type: 'start';
  config: BacktestConfig;
  prices: PriceData;
}

/** Messages from worker to main thread */
export interface WorkerResponse {
  type: 'progress' | 'result' | 'error';
  progress?: BacktestProgress;
  result?: BacktestResult;
  error?: string;
}
