import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

import type { RiskProfileId } from "../../shared";

/**
 * Asset to add to portfolio during onboarding
 */
export class OnboardingAssetDto {
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  assetType?: string;
}

/**
 * DTO for creating a new portfolio during onboarding
 */
export class CreatePortfolioDto {
  // Step 1 - Basic info
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  initialCapital!: number;

  @IsOptional()
  @IsString()
  baseCurrency?: string;

  // Step 2 - Assets
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OnboardingAssetDto)
  assets!: OnboardingAssetDto[];

  // Step 3 - Weight allocation
  @IsString()
  @IsIn(["sharpe", "manual", "equal"])
  weightAllocationMethod!: "sharpe" | "manual" | "equal";

  @IsOptional()
  @IsObject()
  targetWeights?: Record<string, number>;

  // Step 4 - Risk Profile (optional, overrides leverage params if provided)
  @IsOptional()
  @IsString()
  @IsIn(["conservative", "moderate", "growth", "aggressive"])
  riskProfile?: RiskProfileId;

  // Step 4 - Optional configuration (can be overridden by riskProfile)
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
  contributionDayOfMonth?: number;

  @IsOptional()
  @IsBoolean()
  contributionEnabled?: boolean;
}

/**
 * Response DTO for portfolio creation
 */
export interface CreatePortfolioResponse {
  portfolio: {
    id: string;
    name: string;
    initialCapital: number;
    baseCurrency: string;
  };
  assetsCreated: number;
  historicalDataDownloaded: boolean;
  targetWeights: Record<string, number>;
  equalWeights: Record<string, number>;
  warnings?: string[];
}


