import { Controller, Get, Post, Body, Param, Query, Patch, UseGuards } from '@nestjs/common';
import { StockTakeService } from './stock-take.service';
import { CreateStockTakeDto, StockTakeItemDto } from './dto/create-stock-take.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('stock-take')
export class StockTakeController {
  constructor(private readonly service: StockTakeService) {}

  @Post()
  create(
    @Query('companyId') companyId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateStockTakeDto,
  ) {
    return this.service.create(companyId, user.id, dto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.service.findAll(companyId, warehouseId);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.service.findOne(companyId, id);
  }

  @Patch(':id/items')
  updateItems(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body('items') items: StockTakeItemDto[],
  ) {
    return this.service.updateItems(companyId, id, items);
  }

  @Post(':id/complete')
  complete(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.service.complete(companyId, id, user.id);
  }
}
