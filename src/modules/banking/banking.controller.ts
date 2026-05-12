import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { BankingService } from './banking.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  CreateTransferDto,
  AdjustBalanceDto,
} from './dto/banking.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('banking')
export class BankingController {
  constructor(private readonly bankingService: BankingService) {}

  // ========================================
  // BANK ACCOUNT MANAGEMENT
  // ========================================

  /**
   * POST /banking/accounts
   * Create a new bank or cash account linked to a GL Account
   */
  @Permissions('banking:create')
  @Post('accounts')
  createBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.bankingService.createBankAccount(dto);
  }

  /**
   * GET /banking/accounts?companyId=xxx&includeInactive=false
   */
  @Permissions('banking:read')
  @Get('accounts')
  listBankAccounts(
    @Query('companyId') companyId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.bankingService.listBankAccounts(companyId, includeInactive === 'true');
  }

  /**
   * GET /banking/accounts/:id?companyId=xxx
   */
  @Permissions('banking:read')
  @Get('accounts/:id')
  getBankAccount(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.bankingService.getBankAccount(id, companyId);
  }

  /**
   * PUT /banking/accounts/:id?companyId=xxx
   */
  @Permissions('banking:update')
  @Put('accounts/:id')
  updateBankAccount(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateBankAccountDto,
  ) {
    return this.bankingService.updateBankAccount(id, companyId, dto);
  }

  // ========================================
  // BALANCE SUMMARY
  // ========================================

  /**
   * GET /banking/summary?companyId=xxx
   * Get total balances grouped by account type
   */
  @Permissions('banking:read')
  @Get('summary')
  getBalanceSummary(@Query('companyId') companyId: string) {
    return this.bankingService.getBalanceSummary(companyId);
  }

  // ========================================
  // TRANSFERS
  // ========================================

  /**
   * POST /banking/transfers
   * Transfer funds between accounts (auto-posts journal entry)
   */
  @Permissions('banking:transfer')
  @Post('transfers')
  createTransfer(@Body() dto: CreateTransferDto) {
    return this.bankingService.createTransfer(dto);
  }

  /**
   * GET /banking/transfers?companyId=xxx&accountId=xxx&page=1&limit=20
   */
  @Permissions('banking:read')
  @Get('transfers')
  listTransfers(
    @Query('companyId') companyId: string,
    @Query('accountId') accountId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.bankingService.listTransfers(companyId, { page, limit, accountId });
  }

  // ========================================
  // TRANSACTION HISTORY
  // ========================================

  /**
   * GET /banking/accounts/:id/transactions?companyId=xxx&type=DEBIT&page=1
   */
  @Permissions('banking:read')
  @Get('accounts/:id/transactions')
  getTransactionHistory(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Query('type') type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit?: number,
  ) {
    return this.bankingService.getTransactionHistory(id, companyId, { page, limit, type });
  }

  // ========================================
  // BALANCE ADJUSTMENT
  // ========================================

  /**
   * POST /banking/adjust
   * Manual balance adjustment with journal entry
   */
  @Permissions('banking:update')
  @Post('adjust')
  adjustBalance(@Body() dto: AdjustBalanceDto) {
    return this.bankingService.adjustBalance(dto);
  }
}
