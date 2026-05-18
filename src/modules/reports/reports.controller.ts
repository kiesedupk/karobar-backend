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

  /**
   * GET /reports/tax-summary?companyId=xxx&startDate=...&endDate=...
   * Tax / GST Summary — Tax Collected (Sales) and Tax Paid (Purchases).
   */
  @Permissions('report:read')
  @Get('tax-summary')
  getTaxSummary(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getTaxSummary(companyId, {
      startDate,
      endDate,
    });
  }

  /**
   * GET /reports/branch-summary?companyId=xxx&startDate=...&endDate=...
   * Branch / Warehouse Summary — Sales, Purchases, and Inventory by branch.
   */
  @Permissions('report:read')
  @Get('branch-summary')
  getBranchSummary(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getBranchSummary(companyId, {
      startDate,
      endDate,
    });
  }

  @Permissions('report:read')
  @Get('sales-by-customer')
  getSalesByCustomer(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesByCustomer(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('sales-by-product')
  getSalesByProduct(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesByProduct(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('daily-profit')
  getDailyProfit(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getDailyProfit(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('profit-by-product')
  getProfitByProduct(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getProfitByProduct(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('profit-by-customer')
  getProfitByCustomer(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getProfitByCustomer(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('top-products')
  getTopProducts(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getTopProducts(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('aging')
  getAgingReport(@Query('companyId') companyId: string) {
    return this.reportsService.getAgingReport(companyId);
  }

  @Permissions('report:read')
  @Get('expense-by-category')
  getExpenseByCategory(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getExpenseByCategory(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('purchase-by-vendor')
  getPurchaseByVendor(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getPurchaseByVendor(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('payment-collection')
  getPaymentCollection(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getPaymentCollection(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('stock-valuation')
  getStockValuation(@Query('companyId') companyId: string) {
    return this.reportsService.getStockValuation(companyId);
  }

  @Permissions('report:read')
  @Get('slow-moving-stock')
  getSlowMovingStock(
    @Query('companyId') companyId: string,
    @Query('daysThreshold') daysThreshold?: string,
  ) {
    const days = daysThreshold ? parseInt(daysThreshold, 10) : 90;
    return this.reportsService.getSlowMovingStock(companyId, days);
  }

  @Permissions('report:read')
  @Get('peak-hours')
  getPeakHoursAnalysis(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getPeakHoursAnalysis(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('payables-aging')
  getPayablesAging(@Query('companyId') companyId: string) {
    return this.reportsService.getPayablesAging(companyId);
  }

  @Permissions('report:read')
  @Get('sales-summary')
  getSalesSummary(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getSalesSummary(companyId, { startDate, endDate });
  }

  @Permissions('report:read')
  @Get('dashboard-summary')
  getDashboardSummary(@Query('companyId') companyId: string) {
    return this.reportsService.getDashboardSummary(companyId);
  }
}
