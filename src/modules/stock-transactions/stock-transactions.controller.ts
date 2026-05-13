import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { StockTransactionsService } from './stock-transactions.service';
import { StockInDto, StockOutDto, StockAdjustmentDto } from './dto/stock-transaction.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('stock-transactions')
export class StockTransactionsController {
  constructor(private readonly stockService: StockTransactionsService) {}

  @Post('stock-in')
  stockIn(@Body('companyId') companyId: string, @Body() dto: StockInDto) {
    return this.stockService.stockIn(companyId, dto);
  }

  @Post('stock-out')
  stockOut(@Body('companyId') companyId: string, @Body() dto: StockOutDto) {
    return this.stockService.stockOut(companyId, dto);
  }

  @Post('adjust')
  adjust(@Body('companyId') companyId: string, @Body() dto: StockAdjustmentDto) {
    return this.stockService.adjust(companyId, dto);
  }

  @Get('history')
  getHistory(
    @Query('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('productId') productId?: string,
    @Query('type') type?: string,
  ) {
    return this.stockService.getHistory(
      companyId,
      page ? +page : 1,
      limit ? +limit : 20,
      { warehouseId, productId, type },
    );
  }

  @Get('product-summary')
  getProductSummary(
    @Query('companyId') companyId: string,
    @Query('productId') productId: string,
  ) {
    return this.stockService.getProductStockSummary(companyId, productId);
  }
}
