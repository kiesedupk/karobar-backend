import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsNumber,
  IsBoolean,
  IsIn,
  Min,
  ArrayMinSize,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM'];

export class RecurringItemDto {
  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxRate?: number;
}

export class CreateRecurringInvoiceDto {
  @IsNotEmpty()
  @IsString()
  companyId: string;

  @IsNotEmpty()
  @IsString()
  customerId: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(FREQUENCIES, {
    message:
      'frequency must be one of: WEEKLY, MONTHLY, QUARTERLY, YEARLY, CUSTOM',
  })
  frequency: string;

  @ValidateIf((o) => o.frequency === 'CUSTOM')
  @IsNumber()
  @Min(1, { message: 'intervalDays must be at least 1 for CUSTOM frequency' })
  intervalDays?: number;

  @IsNotEmpty()
  @IsDateString()
  nextIssueDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  daysDueAfter?: number; // Default 30

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one template item is required' })
  @ValidateNested({ each: true })
  @Type(() => RecurringItemDto)
  templateItems: RecurringItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRecurringInvoiceDto {
  @IsOptional()
  @IsString()
  @IsIn(FREQUENCIES)
  frequency?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  intervalDays?: number;

  @IsOptional()
  @IsDateString()
  nextIssueDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  daysDueAfter?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecurringItemDto)
  templateItems?: RecurringItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
