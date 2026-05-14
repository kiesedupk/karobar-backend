import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { StockAdjustmentsService } from './stock-adjustments.service';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('stock-adjustments')
export class StockAdjustmentsController {
  constructor(private readonly service: StockAdjustmentsService) {}

  @Post()
  create(
    @Query('companyId') companyId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateStockAdjustmentDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.findAll(companyId, page, limit);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.service.findOne(companyId, id);
  }

  @Post(':id/approve')
  approve(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.approve(companyId, id, user.id);
  }

  @Post(':id/reject')
  reject(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.reject(companyId, id, user.id);
  }
}
