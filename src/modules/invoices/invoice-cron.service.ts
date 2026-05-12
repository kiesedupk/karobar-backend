import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoicesService } from './invoices.service';

@Injectable()
export class InvoiceCronService {
  private readonly logger = new Logger(InvoiceCronService.name);

  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * Runs every day at midnight (00:00) to:
   * 1. Mark overdue invoices (SENT/PARTIAL past due date → OVERDUE)
   * 2. Generate recurring invoices that are due
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyInvoiceTasks() {
    this.logger.log('⏰ Running daily invoice cron job...');

    // 1. Mark overdue invoices across all companies
    try {
      const overdueResult = await this.invoicesService.markOverdueInvoices();
      this.logger.log(`✅ Overdue scan: ${overdueResult.count} invoice(s) marked as overdue`);
    } catch (err: any) {
      this.logger.error(`❌ Overdue scan failed: ${err.message}`);
    }

    // 2. Generate recurring invoices across all companies
    try {
      const recurringResult = await this.invoicesService.generateDueRecurringInvoices();
      this.logger.log(`✅ Recurring generation: ${recurringResult.generated.length} invoice(s) generated`);
    } catch (err: any) {
      this.logger.error(`❌ Recurring generation failed: ${err.message}`);
    }
  }
}
