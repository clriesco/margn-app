import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateContributionDto {
  @IsUUID()
  portfolioId!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsIn(['contribution', 'withdrawal'])
  type?: 'contribution' | 'withdrawal';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}

