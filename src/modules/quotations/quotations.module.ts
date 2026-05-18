import { Module } from '@nestjs/common';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../../common/audit/audit.module';
import { PeriodsModule } from '../periods/periods.module';

@Module({
  imports: [PrismaModule, AuditModule, PeriodsModule],
  controllers: [QuotationsController],
  providers: [QuotationsService]
})
export class QuotationsModule {}
