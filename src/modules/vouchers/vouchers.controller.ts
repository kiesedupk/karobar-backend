import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly vouchersService: VouchersService) {}

  @Permissions('invoices:write') // Using invoices:write as a proxy for financial transactions for now
  @Post()
  create(@Body() createVoucherDto: CreateVoucherDto, @Query('companyId') companyId: string) {
    createVoucherDto.companyId = companyId;
    return this.vouchersService.create(createVoucherDto);
  }

  @Permissions('invoices:read')
  @Get()
  findAll(@Query('companyId') companyId: string, @Query('type') type?: string) {
    return this.vouchersService.findAll(companyId, type);
  }

  @Permissions('invoices:read')
  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.vouchersService.findOne(id, companyId);
  }

  @Permissions('invoices:write')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.vouchersService.remove(id, companyId);
  }
}
