import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreatePortfolioFromStrategyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @Min(0)
  initialCapital!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyContribution?: number;
}
