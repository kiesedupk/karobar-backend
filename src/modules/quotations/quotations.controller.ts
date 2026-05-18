import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Request } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateQuotationDto } from './dto/create-quotation.dto';

@UseGuards(JwtAuthGuard)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Post()
  create(@Request() req: any, @Body() dto: CreateQuotationDto) {
    dto.companyId = req.user.companyId;
    return this.quotationsService.create(dto);
  }

  @Get()
  findAll(@Request() req: any) {
    return this.quotationsService.findAll(req.user.companyId);
  }

  @Get(':id')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.quotationsService.findOne(req.user.companyId, id);
  }

  @Put(':id/status')
  updateStatus(@Request() req: any, @Param('id') id: string, @Body('status') status: string) {
    return this.quotationsService.updateStatus(req.user.companyId, id, status);
  }

  @Post(':id/convert')
  convertToInvoice(@Request() req: any, @Param('id') id: string, @Body() body: any) {
    return this.quotationsService.convertToInvoice(req.user.companyId, id, body);
  }

  @Delete(':id')
  delete(@Request() req: any, @Param('id') id: string) {
    return this.quotationsService.delete(req.user.companyId, id);
  }
}
