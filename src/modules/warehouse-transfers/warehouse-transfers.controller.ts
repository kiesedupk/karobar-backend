import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { WarehouseTransfersService } from './warehouse-transfers.service';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('warehouse-transfers')
export class WarehouseTransfersController {
  constructor(private readonly transfersService: WarehouseTransfersService) {}

  @Post()
  create(@Body('companyId') companyId: string, @Body() createDto: CreateWarehouseTransferDto) {
    return this.transfersService.create(companyId, createDto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.transfersService.findAll(companyId, page ? +page : 1, limit ? +limit : 20);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.transfersService.findOne(companyId, id);
  }

  @Post(':id/complete')
  complete(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.transfersService.completeTransfer(companyId, id);
  }

  @Post(':id/cancel')
  cancel(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.transfersService.cancelTransfer(companyId, id);
  }
}
