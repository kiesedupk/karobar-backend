import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceCronService } from './invoice-cron.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceCronService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
