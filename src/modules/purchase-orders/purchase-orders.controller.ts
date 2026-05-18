import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreatePurchaseOrderDto) {
    dto.companyId = req.user.companyId;
    return this.purchaseOrdersService.create(dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.purchaseOrdersService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.findOne(req.user.companyId, id);
  }

  @Put(':id/status')
  updateStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.purchaseOrdersService.updateStatus(req.user.companyId, id, status);
  }

  @Post(':id/convert')
  convertToBill(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.convertToBill(req.user.companyId, id);
  }

  @Delete(':id')
  delete(@Request() req: any, @Param('id') id: string) {
    return this.purchaseOrdersService.delete(req.user.companyId, id);
  }
}
