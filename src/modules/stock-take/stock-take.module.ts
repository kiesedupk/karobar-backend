import { Module } from '@nestjs/common';
import { StockTakeService } from './stock-take.service';
import { StockTakeController } from './stock-take.controller';

@Module({
  controllers: [StockTakeController],
  providers: [StockTakeService],
})
export class StockTakeModule {}
