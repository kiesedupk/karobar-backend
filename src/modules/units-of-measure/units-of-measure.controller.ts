import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UnitsOfMeasureService } from './units-of-measure.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsOfMeasureController {
  constructor(private readonly unitsService: UnitsOfMeasureService) {}

  @Post()
  create(@Body() createDto: CreateUnitDto) {
    return this.unitsService.create(createDto.companyId, createDto);
  }

  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.unitsService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.unitsService.findOne(companyId, id);
  }

  @Patch(':id')
  update(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateUnitDto,
  ) {
    return this.unitsService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.unitsService.remove(companyId, id);
  }
}
