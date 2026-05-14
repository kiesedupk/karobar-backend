import { Module } from '@nestjs/common';
import { WarehouseTransfersController } from './warehouse-transfers.controller';
import { WarehouseTransfersService } from './warehouse-transfers.service';

@Module({
  controllers: [WarehouseTransfersController],
  providers: [WarehouseTransfersService],
})
export class WarehouseTransfersModule {}
