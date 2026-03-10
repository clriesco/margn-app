import { IsString, IsIn, IsOptional } from "class-validator";

export class CreateCheckoutDto {
  @IsString()
  @IsIn(["pro_monthly", "pro_yearly", "institutional_monthly", "institutional_yearly"])
  priceKey!: string;

  @IsOptional()
  @IsString()
  voucherCode?: string;
}
