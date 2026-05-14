import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/trial-balance?companyId=xxx&startDate=2026-01-01&endDate=2026-12-31
   * Trial Balance — verifies Total Debits = Total Credits.
   */
  @Permissions('report:read')
  @Get('trial-balance')
  getTrialBalance(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getTrialBalance(companyId, {
      startDate,
      endDate,
    });
  }

  /**
   * GET /reports/profit-loss?companyId=xxx&startDate=2026-01-01&endDate=2026-12-31
   * Profit & Loss (Income Statement) — Revenue minus Expenses = Net Income.
   */
  @Permissions('report:read')
  @Get('profit-loss')
  getProfitAndLoss(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getProfitAndLoss(companyId, {
      startDate,
      endDate,
    });
  }

  /**
   * GET /reports/balance-sheet?companyId=xxx&endDate=2026-12-31
   * Balance Sheet — Assets = Liabilities + Equity.
   */
  @Permissions('report:read')
  @Get('balance-sheet')
  getBalanceSheet(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getBalanceSheet(companyId, {
      startDate,
      endDate,
    });
  }

  /**
   * GET /reports/cash-flow?companyId=xxx&startDate=2026-01-01&endDate=2026-12-31
   * Cash Flow Statement — Operating + Investing + Financing activities.
   */
  @Permissions('report:read')
  @Get('cash-flow')
  getCashFlowStatement(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getCashFlowStatement(companyId, {
      startDate,
      endDate,
    });
  }

  /**
   * GET /reports/ledger/:accountId?companyId=xxx&startDate=...&endDate=...
   * Account Ledger — detailed transaction history with running balance.
   */
  @Permissions('report:read')
  @Get('ledger/:accountId')
  getAccountLedger(
    @Param('accountId') accountId: string,
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getAccountLedger(companyId, accountId, {
      startDate,
      endDate,
    });
  }
}
