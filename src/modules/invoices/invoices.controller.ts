import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  /**
   * POST /invoices
   * Create a new draft invoice with line items, taxes, and discounts.
   */
  @Permissions('invoice:create')
  @Post()
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createInvoice(dto);
  }

  /**
   * GET /invoices?companyId=xxx&status=SENT&customerId=xxx&page=1&limit=20
   * List invoices with pagination and filters.
   */
  @Permissions('invoice:read')
  @Get()
  listInvoices(
    @Query('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.invoicesService.listInvoices(companyId, { page, limit, status, customerId });
  }

  /**
   * GET /invoices/:id?companyId=xxx
   * Get a single invoice with all items and payment history.
   */
  @Permissions('invoice:read')
  @Get(':id')
  getInvoice(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.getInvoice(id, companyId);
  }

  /**
   * GET /invoices/:id/pdf?companyId=xxx
   * Get invoice data structured for PDF rendering.
   */
  @Permissions('invoice:read')
  @Get(':id/pdf')
  getInvoicePdfData(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.getInvoicePdfData(id, companyId);
  }

  /**
   * POST /invoices/:id/send?companyId=xxx
   * Mark invoice as SENT and optionally auto-post journal entry.
   * Pass receivableAccountId, revenueAccountId, taxAccountId in body.
   */
  @Permissions('invoice:send')
  @Post(':id/send')
  sendInvoice(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() body: {
      receivableAccountId?: string;
      revenueAccountId?: string;
      taxAccountId?: string;
      discountAccountId?: string;
    },
  ) {
    return this.invoicesService.sendInvoice(id, companyId, body);
  }

  /**
   * POST /invoices/:id/cancel?companyId=xxx
   * Cancel an invoice and void its journal entry.
   */
  @Permissions('invoice:delete')
  @Post(':id/cancel')
  cancelInvoice(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.cancelInvoice(id, companyId);
  }

  /**
   * POST /invoices/payments
   * Record a payment against an invoice.
   * Optionally auto-posts a journal entry (Debit Cash/Bank, Credit Receivable).
   */
  @Permissions('invoice:create')
  @Post('payments')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.invoicesService.recordPayment(dto);
  }
}
