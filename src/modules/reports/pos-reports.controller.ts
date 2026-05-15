import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PosReportsService } from './pos-reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('reports/pos')
export class PosReportsController {
  constructor(private readonly posReportsService: PosReportsService) {}

  @Get('revenue')
  getRevenue(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.posReportsService.getRevenueAnalytics(companyId, new Date(startDate), new Date(endDate));
  }

  @Get('top-selling')
  getTopSelling(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.posReportsService.getTopSellingProducts(companyId, new Date(startDate), new Date(endDate));
  }

  @Get('hourly')
  getHourly(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.posReportsService.getHourlySales(companyId, new Date(startDate), new Date(endDate));
  }

  @Get('cashier-performance')
  getCashierPerformance(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.posReportsService.getCashierPerformance(companyId, new Date(startDate), new Date(endDate));
  }

  @Get('trends')
  getTrends(
    @Query('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.posReportsService.getProductTrends(companyId, new Date(startDate), new Date(endDate));
  }
}
