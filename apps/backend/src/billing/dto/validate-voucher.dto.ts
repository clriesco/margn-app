import { IsString } from "class-validator";

export class ValidateVoucherDto {
  @IsString()
  code!: string;
}
