import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ProductType {
  INVENTORY = 'INVENTORY',
  SERVICE = 'SERVICE',
  NON_INVENTORY = 'NON_INVENTORY',
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  sku?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  uomId?: string;

  @IsEnum(ProductType)
  @IsOptional()
  type?: ProductType = ProductType.INVENTORY;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  costPrice?: number = 0;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  salePrice?: number = 0;

  @IsBoolean()
  @IsOptional()
  trackInventory?: boolean = false;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  currentStock?: number = 0;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  reorderPoint?: number = 0;

  @IsString()
  @IsOptional()
  incomeAccountId?: string;

  @IsString()
  @IsOptional()
  expenseAccountId?: string;

  @IsString()
  @IsOptional()
  assetAccountId?: string;
}
