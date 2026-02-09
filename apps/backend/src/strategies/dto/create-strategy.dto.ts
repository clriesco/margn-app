import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsObject,
  IsArray,
  ValidateNested,
  IsOptional,
  IsBoolean,
} from 'class-validator';

class TrajectoryPoint {
  @IsString()
  date!: string;

  @IsNumber()
  equity!: number;
}

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
  @IsNumber()
  xirr?: number | null;

  @IsOptional()
  @IsNumber()
  windowIndex?: number;
}

class BacktestConfig {
  @IsArray()
  @IsString({ each: true })
  symbols!: string[];

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

  @IsObject()
  weights!: Record<string, number>;

  @IsString()
  weightMode!: string; // 'sharpe' | 'manual' | 'equal'

  @IsOptional()
  @IsBoolean()
  dynamicWeights?: boolean; // Re-optimize weights monthly (only for sharpe mode)
}

class BacktestMetrics {
  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p10!: ScenarioMetrics;

  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p50!: ScenarioMetrics;

  @ValidateNested()
  @Type(() => ScenarioMetrics)
  p90!: ScenarioMetrics;

  @IsNumber()
  totalWindows!: number;

  @IsNumber()
  marginCallCount!: number;

  @IsOptional()
  @IsObject()
  score?: {
    composite: number;
    dimensions: {
      dispersion: number;
      worstCase: number;
      sharpe: number;
      drawdown: number;
    };
    marginCallPenalty: boolean;
  };
}

class ScenarioTrajectory {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrajectoryPoint)
  points!: TrajectoryPoint[];
}

class BacktestTrajectories {
  @ValidateNested()
  @Type(() => ScenarioTrajectory)
  p10!: ScenarioTrajectory;

  @ValidateNested()
  @Type(() => ScenarioTrajectory)
  p50!: ScenarioTrajectory;

  @ValidateNested()
  @Type(() => ScenarioTrajectory)
  p90!: ScenarioTrajectory;
}

export class CreateStrategyDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => BacktestConfig)
  config!: BacktestConfig;

  @ValidateNested()
  @Type(() => BacktestMetrics)
  metrics!: BacktestMetrics;

  @ValidateNested()
  @Type(() => BacktestTrajectories)
  trajectories!: BacktestTrajectories;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateVisibilityDto {
  @IsBoolean()
  isPublic!: boolean;
}
