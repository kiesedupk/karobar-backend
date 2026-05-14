import { IsString, IsEnum, IsNumber, IsOptional, Min } from 'class-validator';

export enum AdjustmentType {
  INCREASE = 'INCREASE',
  DECREASE = 'DECREASE',
}

export enum AdjustmentReason {
  DAMAGED = 'DAMAGED',
  LOST = 'LOST',
  FOUND = 'FOUND',
  CORRECTION = 'CORRECTION',
  EXPIRED = 'EXPIRED',
}

export class CreateStockAdjustmentDto {
  @IsString()
  warehouseId: string;

  @IsString()
  productId: string;

  @IsEnum(AdjustmentType)
  type: AdjustmentType;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsEnum(AdjustmentReason)
  reason: AdjustmentReason;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
