import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsOfMeasureController {
  constructor(private readonly unitsService: UnitsOfMeasureService) {}

  @Post()
  create(@CurrentCompany() companyId: string, @Body() createDto: CreateUnitDto) {
    return this.unitsService.create(companyId, createDto);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.unitsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.unitsService.findOne(companyId, id);
  }

  @Patch(':id')
  update(@CurrentCompany() companyId: string, @Param('id') id: string, @Body() updateDto: UpdateUnitDto) {
    return this.unitsService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.unitsService.remove(companyId, id);
  }
}
