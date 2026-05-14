import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { InventoryReportsController } from './inventory-reports.controller';

@Module({
  controllers: [ReportsController, InventoryReportsController],
  providers: [ReportsService, InventoryReportsService],
  exports: [ReportsService, InventoryReportsService],
})
export class ReportsModule {}
