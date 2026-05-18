import { IsString, IsNumber, IsBoolean, IsOptional, Min } from 'class-validator';

export class CreateTaxRateDto {
  @IsString()
  companyId: string;

  @IsString()
  name: string;

  @IsNumber()
  @Min(0)
  rate: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
