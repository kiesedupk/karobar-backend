import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../../common/audit/audit.module';
import { PeriodsModule } from '../periods/periods.module';

@Module({
  imports: [PrismaModule, AuditModule, PeriodsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService]
})
export class PurchaseOrdersModule {}
