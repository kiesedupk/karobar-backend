import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DebitNoteItemDto {
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
  unitCost: number;

  @IsNumber()
  @IsOptional()
  taxRate?: number;
}

export class CreateDebitNoteDto {
  @IsString()
  companyId: string;

  @IsString()
  vendorId: string;

  @IsString()
  @IsOptional()
  purchaseBillId?: string;

  @IsString()
  debitNoteNumber: string;

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
  @Type(() => DebitNoteItemDto)
  items: DebitNoteItemDto[];
}
