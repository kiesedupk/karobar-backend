import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreditNoteItemDto {
  @IsString()
  @IsOptional()
  productId?: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class CreateCreditNoteDto {
  @IsString()
  companyId: string;

  @IsString()
  customerId: string;

  @IsString()
  @IsOptional()
  invoiceId?: string;

  @IsString()
  creditNoteNumber: string;

  @IsDateString()
  issueDate: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  warehouseId?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreditNoteItemDto)
  items: CreditNoteItemDto[];
}
