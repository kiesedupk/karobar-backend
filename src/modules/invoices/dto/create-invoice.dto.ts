import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InvoiceItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001, { message: 'Quantity must be greater than zero' })
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Unit price cannot be negative' })
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountRate?: number; // Percentage (e.g., 5 for 5%)

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRate?: number; // Percentage (e.g., 17 for 17% GST)
}

export class CreateInvoiceDto {
  @IsNotEmpty()
  @IsString()
  companyId: string;

  @IsNotEmpty()
  @IsString()
  customerId: string;

  @IsOptional()
  @IsString()
  invoiceNumber?: string; // Auto-generated if not provided

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  globalDiscountAmount?: number; // Flat discount on total (in currency)

  @IsArray()
  @ArrayMinSize(1, { message: 'An invoice must have at least one item' })
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  // Account IDs for journal entry auto-posting
  @IsOptional()
  @IsString()
  receivableAccountId?: string; // Accounts Receivable

  @IsOptional()
  @IsString()
  revenueAccountId?: string; // Sales Revenue

  @IsOptional()
  @IsString()
  taxAccountId?: string; // Tax Payable

  @IsOptional()
  @IsString()
  discountAccountId?: string; // Discount Given
}
