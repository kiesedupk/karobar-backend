import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, Request } from '@nestjs/common';
import { TaxRatesService } from './tax-rates.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly taxRatesService: TaxRatesService) {}

  @Permissions('settings:write')
  @Post()
  create(@Body() createTaxRateDto: CreateTaxRateDto, @Query('companyId') companyId: string) {
    createTaxRateDto.companyId = companyId;
    return this.taxRatesService.create(createTaxRateDto);
  }

  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.taxRatesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.taxRatesService.findOne(id, companyId);
  }

  @Permissions('settings:write')
  @Patch(':id')
  update(@Param('id') id: string, @Query('companyId') companyId: string, @Body() updateTaxRateDto: UpdateTaxRateDto) {
    return this.taxRatesService.update(id, companyId, updateTaxRateDto);
  }

  @Permissions('settings:write')
  @Delete(':id')
  remove(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.taxRatesService.remove(id, companyId);
  }
}
