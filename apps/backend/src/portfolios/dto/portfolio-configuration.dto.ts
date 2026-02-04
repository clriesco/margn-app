import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/**
 * Target weight for a single asset
 */
export class TargetWeightDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  weight!: number;
}

/**
 * DTO for updating portfolio configuration
 */
export class UpdatePortfolioConfigurationDto {
  // Contribution settings
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyContribution?: number;

  @IsOptional()
  @IsString()
  @IsIn(["weekly", "biweekly", "monthly", "quarterly"])
  contributionFrequency?: "weekly" | "biweekly" | "monthly" | "quarterly";

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(31)
  contributionDayOfMonth?: number; // Day of month (1-31) for monthly/quarterly, or day of week (0-6, 0=Sunday) for weekly/biweekly

  @IsOptional()
  @IsBoolean()
  contributionEnabled?: boolean;

  // Leverage settings
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  leverageMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  leverageMax?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  leverageTarget?: number;

  // Target weights (e.g., { "SPY": 0.6, "GLD": 0.25, "BTC-USD": 0.15 })
  @IsOptional()
  @IsObject()
  targetWeights?: Record<string, number>;

  // Weight constraints
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  maxWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minWeight?: number;

  // Risk parameters
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(0.5)
  maintenanceMarginRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(0.5)
  safeMarginRatio?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(0.5)
  criticalMarginRatio?: number;

  // Deploy signal thresholds
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  drawdownRedeployThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  weightDeviationThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(252)
  volatilityLookbackDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volatilityRedeployThreshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  gradualDeployFactor?: number;

  // Optimization parameters
  @IsOptional()
  @IsBoolean()
  useDynamicSharpeRebalance?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  sharpeWeightsLookbackMonths?: number; // 0 = use all history

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  meanReturnShrinkage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(0.2)
  riskFreeRate?: number;
}

/**
 * Response DTO for portfolio configuration
 */
export interface PortfolioConfigurationResponse {
  // Basic info
  portfolioId: string;
  name: string;
  baseCurrency: string;
  initialCapital: number;

  // Contribution settings
  monthlyContribution: number | null;
  contributionFrequency: "weekly" | "biweekly" | "monthly" | "quarterly";
  contributionDayOfMonth: number;
  contributionEnabled: boolean;

  // Leverage settings
  leverageMin: number;
  leverageMax: number;
  leverageTarget: number;

  // Target weights
  targetWeights: Record<string, number>;

  // Weight constraints
  maxWeight: number;
  minWeight: number;

  // Risk parameters
  maintenanceMarginRatio: number;
  safeMarginRatio: number | null;
  criticalMarginRatio: number | null;

  // Deploy signal thresholds
  drawdownRedeployThreshold: number;
  weightDeviationThreshold: number;
  volatilityLookbackDays: number;
  volatilityRedeployThreshold: number;
  gradualDeployFactor: number;

  // Optimization parameters
  useDynamicSharpeRebalance: boolean;
  sharpeWeightsLookbackMonths: number;
  meanReturnShrinkage: number;
  riskFreeRate: number;

  // Metadata
  updatedAt: string;
}
