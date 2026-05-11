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

export class JournalLineDto {
  @IsNotEmpty()
  @IsString()
  accountId: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Debit amount cannot be negative' })
  debit: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Credit amount cannot be negative' })
  credit: number;
}

export class CreateJournalEntryDto {
  @IsNotEmpty()
  @IsString()
  companyId: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  status?: string; // DRAFT or POSTED — defaults to POSTED

  @IsArray()
  @ArrayMinSize(2, { message: 'A journal entry must have at least 2 lines (one debit and one credit)' })
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines: JournalLineDto[];
}
