import { Controller, Get, Post, Body, Param, UseGuards, Query } from '@nestjs/common';
import { PurchaseBillsService } from './purchase-bills.service';
import { CreatePurchaseBillDto } from './dto/create-purchase-bill.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('purchase-bills')
export class PurchaseBillsController {
  constructor(private readonly billsService: PurchaseBillsService) {}

  @Post()
  create(@Body() dto: CreatePurchaseBillDto) {
    return this.billsService.create(dto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.billsService.findAll(companyId, page ? +page : 1, limit ? +limit : 20);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.billsService.findOne(companyId, id);
  }
}
