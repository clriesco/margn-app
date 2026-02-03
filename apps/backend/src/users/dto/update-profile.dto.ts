import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  MaxLength,
} from "class-validator";

/**
 * DTO for updating user profile
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: "avatarUrl must be a valid URL" })
  avatarUrl?: string | null;

  @IsOptional()
  @IsBoolean()
  notifyOnRecommendations?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnContributions?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnLeverageAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnRebalance?: boolean;
}

/**
 * Response DTO for user profile
 */
export interface ProfileResponse {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  notifyOnRecommendations: boolean;
  notifyOnContributions: boolean;
  notifyOnLeverageAlerts: boolean;
  notifyOnRebalance: boolean;
  createdAt: Date;
  updatedAt: Date;
}



