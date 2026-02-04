import { Type } from 'class-transformer';
import { IsNumber, IsObject, IsString, ValidateNested, IsOptional } from 'class-validator';

class ScenarioMetrics {
  @IsString()
  startDate!: string;

  @IsString()
  endDate!: string;

  @IsNumber()
  finalCapital!: number;

  @IsNumber()
  totalContributed!: number;

  @IsNumber()
  returnPercent!: number;

  @IsNumber()
  cagr!: number;

  @IsNumber()
  sharpe!: number;

  @IsNumber()
  maxDrawdownEquity!: number;

  @IsNumber()
  recoveryDays!: number;

  @IsNumber()
  underwaterDays!: number;

  @IsNumber()
  finalLeverage!: number;

  @IsOptional()
  @IsObject()
  monthlyReturns?: Record<string, number>;
}

class BacktestScenarios {
  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p10!: ScenarioMetrics;

  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p50!: ScenarioMetrics;

  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p90!: ScenarioMetrics;
}

class BacktestConfigSummary {
  @IsNumber()
  initialCapital!: number;

  @IsNumber()
  monthlyContribution!: number;

  @IsNumber()
  leverageMin!: number;

  @IsNumber()
  leverageMax!: number;

  @IsNumber()
  leverageTarget!: number;

  @IsNumber()
  windowMonths!: number;

  @IsNumber()
  totalWindows!: number;

  @IsNumber()
  marginCallCount!: number;

  // Strategy configuration
  @IsString()
  weightMode!: string; // 'sharpe' | 'manual' | 'equal'

  @IsOptional()
  dynamicWeights?: boolean; // Re-optimize weights monthly (only for sharpe mode)

  @IsOptional()
  @IsNumber()
  dynamicWeightsLookback?: number; // Months of historical data for dynamic optimization

  @IsOptional()
  @IsNumber()
  meanReturnShrinkage?: number;

  @IsOptional()
  @IsNumber()
  riskFreeRate?: number;

  @IsOptional()
  @IsNumber()
  maxWeight?: number;

  @IsOptional()
  @IsNumber()
  minWeight?: number;

  @IsOptional()
  @IsNumber()
  maintenanceMarginRatio?: number;
}

export class ExplainBacktestDto {
  @IsObject()
  weights!: Record<string, number>;

  @ValidateNested()
  @Type(() => BacktestScenarios)
  scenarios!: BacktestScenarios;

  @ValidateNested()
  @Type(() => BacktestConfigSummary)
  config!: BacktestConfigSummary;

  @IsOptional()
  @IsString({ each: true })
  excludedSymbols?: string[];
}
