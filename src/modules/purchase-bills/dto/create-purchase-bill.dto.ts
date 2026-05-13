import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class PurchaseBillItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @Type(() => Number)
  quantity: number;

  @IsNumber()
  @Type(() => Number)
  unitCost: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  taxRate?: number;
}

export class CreatePurchaseBillDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsOptional()
  vendorId?: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  billNumber: string;

  @IsString()
  @IsNotEmpty()
  paymentAccountId: string; // Cash/Bank account to credit

  @IsDateString()
  @IsOptional()
  billDate?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseBillItemDto)
  items: PurchaseBillItemDto[];
}
