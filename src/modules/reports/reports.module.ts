import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { InventoryReportsService } from './inventory-reports.service';
import { InventoryReportsController } from './inventory-reports.controller';

import { PosReportsService } from './pos-reports.service';
import { PosReportsController } from './pos-reports.controller';

@Module({
  controllers: [ReportsController, InventoryReportsController, PosReportsController],
  providers: [ReportsService, InventoryReportsService, PosReportsService],
  exports: [ReportsService, InventoryReportsService, PosReportsService],
})
export class ReportsModule {}
