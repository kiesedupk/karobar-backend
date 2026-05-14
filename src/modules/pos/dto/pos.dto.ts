import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsUUID, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePosSessionDto {
  @IsUUID()
  warehouseId: string;

  @IsNumber()
  @Min(0)
  openingBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PosItemDto {
  @IsUUID()
  productId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountRate?: number;
}

export class PosCheckoutDto {
  @IsUUID()
  sessionId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosItemDto)
  items: PosItemDto[];

  @IsString()
  paymentMethod: string;

  @IsNumber()
  @Min(0)
  amountPaid: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
