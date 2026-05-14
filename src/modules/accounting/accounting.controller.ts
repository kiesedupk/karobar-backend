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
} from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // ========================================
  // ACCOUNTS CRUD
  // ========================================

  /**
   * POST /accounting/accounts
   * Create a new account in the Chart of Accounts
   * Requires: ADMIN or ACCOUNTANT role
   */
  @Permissions('account:create')
  @Post('accounts')
  createAccount(@Body() createAccountDto: CreateAccountDto) {
    return this.accountingService.createAccount(createAccountDto);
  }

  /**
   * PUT /accounting/accounts/:id?companyId=xxx
   * Update an existing account
   * Requires: ADMIN or ACCOUNTANT role
   */
  @Permissions('account:update')
  @Put('accounts/:id')
  updateAccount(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.accountingService.updateAccount(
      id,
      companyId,
      updateAccountDto,
    );
  }

  /**
   * DELETE /accounting/accounts/:id?companyId=xxx
   * Delete an account (only if it has no journal entries or children)
   * Requires: ADMIN role only
   */
  @Permissions('account:delete')
  @Delete('accounts/:id')
  deleteAccount(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.accountingService.deleteAccount(id, companyId);
  }

  /**
   * GET /accounting/accounts/:id?companyId=xxx
   * Get a single account with parent/children details
   * Requires: ADMIN, ACCOUNTANT, or MANAGER role
   */
  @Permissions('account:read')
  @Get('accounts/:id')
  getAccount(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.accountingService.getAccount(id, companyId);
  }

  /**
   * GET /accounting/accounts?companyId=xxx
   * Get full Chart of Accounts (flat list sorted by code)
   * Requires: ADMIN, ACCOUNTANT, or MANAGER role
   */
  @Permissions('account:read')
  @Get('accounts')
  getChartOfAccounts(@Query('companyId') companyId: string) {
    return this.accountingService.getChartOfAccounts(companyId);
  }

  // ========================================
  // TREE VIEW & BALANCE
  // ========================================

  /**
   * GET /accounting/accounts-tree?companyId=xxx
   * Get hierarchical tree of all accounts
   */
  @Permissions('account:read')
  @Get('accounts-tree')
  getChartOfAccountsTree(@Query('companyId') companyId: string) {
    return this.accountingService.getChartOfAccountsTree(companyId);
  }

  /**
   * GET /accounting/accounts/:id/balance?companyId=xxx
   * Get computed balance for a specific account
   */
  @Permissions('account:read')
  @Get('accounts/:id/balance')
  getAccountBalance(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.accountingService.getAccountBalance(id, companyId);
  }

  /**
   * POST /accounting/seed?companyId=xxx
   * Seed default Chart of Accounts for a new company
   * Requires: ADMIN role only
   */
  @Permissions('account:create')
  @Post('seed')
  seedDefaultAccounts(@Query('companyId') companyId: string) {
    return this.accountingService.seedDefaultAccounts(companyId);
  }
}
