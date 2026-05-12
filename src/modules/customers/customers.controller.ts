import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Permissions('customer:create')
  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Permissions('customer:read')
  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.customersService.findAll(companyId, page, limit, search);
  }

  @Permissions('customer:read')
  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.customersService.findOne(id, companyId);
  }

  @Permissions('customer:update')
  @Put(':id')
  update(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, companyId, dto);
  }

  @Permissions('customer:delete')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.customersService.remove(id, companyId);
  }

  @Permissions('report:read')
  @Get(':id/statement')
  getStatement(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.customersService.getStatement(id, companyId);
  }
}
