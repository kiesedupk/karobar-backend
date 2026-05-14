import { Module } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { StockAdjustmentsController } from './stock-adjustments.controller';

@Module({
  controllers: [StockAdjustmentsController],
  providers: [StockAdjustmentsService],
})
export class StockAdjustmentsModule {}
