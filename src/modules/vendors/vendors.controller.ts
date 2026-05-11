import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER')
  @Post()
  create(@Body() dto: CreateVendorDto) {
    return this.vendorsService.create(dto);
  }

  @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER', 'CASHIER')
  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.vendorsService.findAll(companyId, page, limit, search);
  }

  @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER', 'CASHIER')
  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.vendorsService.findOne(id, companyId);
  }

  @Roles('ADMIN', 'ACCOUNTANT', 'MANAGER')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.vendorsService.update(id, companyId, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.vendorsService.remove(id, companyId);
  }
}
