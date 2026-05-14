import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import {
  CreateRecurringInvoiceDto,
  UpdateRecurringInvoiceDto,
} from './dto/create-recurring.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  // ========================================
  // INVOICE CRUD
  // ========================================

  @Permissions('invoice:create')
  @Post()
  createInvoice(@Body() dto: CreateInvoiceDto) {
    return this.invoicesService.createInvoice(dto);
  }

  @Permissions('invoice:read')
  @Get()
  listInvoices(
    @Query('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.invoicesService.listInvoices(companyId, {
      page,
      limit,
      status,
      customerId,
    });
  }

  @Permissions('invoice:read')
  @Get(':id')
  getInvoice(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.invoicesService.getInvoice(id, companyId);
  }

  @Permissions('invoice:create')
  @Post(':id/send')
  sendInvoiceByEmail(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.sendInvoiceByEmail(id, companyId);
  }

  @Permissions('invoice:read')
  @Get(':id/pdf')
  getInvoicePdfData(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.getInvoicePdfData(id, companyId);
  }

  @Permissions('invoice:send')
  @Post(':id/send')
  sendInvoice(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body()
    body: {
      receivableAccountId?: string;
      revenueAccountId?: string;
      taxAccountId?: string;
      discountAccountId?: string;
    },
  ) {
    return this.invoicesService.sendInvoice(id, companyId, body);
  }

  @Permissions('invoice:delete')
  @Post(':id/cancel')
  cancelInvoice(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.cancelInvoice(id, companyId);
  }

  // ========================================
  // PAYMENTS
  // ========================================

  @Permissions('invoice:create')
  @Post('payments')
  recordPayment(@Body() dto: RecordPaymentDto) {
    return this.invoicesService.recordPayment(dto);
  }

  @Permissions('invoice:read')
  @Get(':id/payments')
  getPaymentHistory(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.getPaymentHistory(id, companyId);
  }

  // ========================================
  // RECURRING INVOICES
  // ========================================

  @Permissions('invoice:create')
  @Post('recurring')
  createRecurring(@Body() dto: CreateRecurringInvoiceDto) {
    return this.invoicesService.createRecurring(dto);
  }

  @Permissions('invoice:read')
  @Get('recurring/list')
  listRecurring(@Query('companyId') companyId: string) {
    return this.invoicesService.listRecurring(companyId);
  }

  @Permissions('invoice:update')
  @Put('recurring/:id')
  updateRecurring(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateRecurringInvoiceDto,
  ) {
    return this.invoicesService.updateRecurring(id, companyId, dto);
  }

  @Permissions('invoice:delete')
  @Delete('recurring/:id')
  deleteRecurring(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.invoicesService.deleteRecurring(id, companyId);
  }

  @Permissions('invoice:create')
  @Post('recurring/generate')
  generateRecurring(@Query('companyId') companyId?: string) {
    return this.invoicesService.generateDueRecurringInvoices(companyId);
  }

  // ========================================
  // OVERDUE TRACKING
  // ========================================

  @Permissions('invoice:update')
  @Post('mark-overdue')
  markOverdue(@Query('companyId') companyId?: string) {
    return this.invoicesService.markOverdueInvoices(companyId);
  }

  @Permissions('report:read')
  @Get('overdue/summary')
  getOverdueSummary(@Query('companyId') companyId: string) {
    return this.invoicesService.getOverdueSummary(companyId);
  }
}
