import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceCronService } from './invoice-cron.service';
import { PeriodsModule } from '../periods/periods.module';
import { CustomersModule } from '../customers/customers.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [CustomersModule, JournalModule, PeriodsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceCronService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
