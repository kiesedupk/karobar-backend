import { IsString, IsNumber, IsOptional, Min, IsDateString, IsEnum } from 'class-validator';

export class CreateVoucherDto {
  @IsString()
  companyId: string;

  @IsString()
  voucherNumber: string;

  @IsEnum(['RECEIPT', 'PAYMENT'])
  type: string;

  @IsDateString()
  date: string;

  @IsString()
  @IsOptional()
  contactType?: string;

  @IsString()
  @IsOptional()
  contactId?: string;

  @IsString()
  accountId: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  description: string;
}
