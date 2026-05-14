import { IsString, IsOptional, IsArray, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StockTakeItemDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0)
  physicalQuantity: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateStockTakeDto {
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTakeItemDto)
  items?: StockTakeItemDto[];
}
