import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { InventoryReportsService } from './inventory-reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('reports/inventory')
export class InventoryReportsController {
  constructor(private readonly inventoryReportsService: InventoryReportsService) {}

  /**
   * GET /reports/inventory/summary?companyId=xxx
   * Stock Summary - Total quantities across all warehouses
   */
  @Permissions('report:read')
  @Get('summary')
  getStockSummary(@Query('companyId') companyId: string) {
    return this.inventoryReportsService.getStockSummary(companyId);
  }

  /**
   * GET /reports/inventory/valuation?companyId=xxx
   * Stock Valuation - FIFO based total value of inventory
   */
  @Permissions('report:read')
  @Get('valuation')
  getStockValuation(@Query('companyId') companyId: string) {
    return this.inventoryReportsService.getStockValuation(companyId);
  }

  /**
   * GET /reports/inventory/low-stock?companyId=xxx
   * Low Stock Report - Items below reorder point
   */
  @Permissions('report:read')
  @Get('low-stock')
  getLowStockReport(@Query('companyId') companyId: string) {
    return this.inventoryReportsService.getLowStockReport(companyId);
  }

  /**
   * GET /reports/inventory/warehouse/:warehouseId?companyId=xxx
   * Warehouse Inventory - Items in a specific warehouse
   */
  @Permissions('report:read')
  @Get('warehouse/:warehouseId')
  getWarehouseStockReport(
    @Param('warehouseId') warehouseId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.inventoryReportsService.getWarehouseStockReport(companyId, warehouseId);
  }

  /**
   * GET /reports/inventory/movement?companyId=xxx&startDate=...&endDate=...&productId=...
   * Inventory Movement - History of stock transactions
   */
  @Permissions('report:read')
  @Get('movement')
  getInventoryMovement(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('productId') productId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.inventoryReportsService.getInventoryMovement(companyId, {
      startDate,
      endDate,
      productId,
      warehouseId,
    });
  }

  /**
   * GET /reports/inventory/dashboard-stats?companyId=xxx
   * Combined inventory stats for dashboard widgets
   */
  @Permissions('report:read')
  @Get('dashboard-stats')
  getDashboardStats(@Query('companyId') companyId: string) {
    return this.inventoryReportsService.getDashboardOverview(companyId);
  }
}
