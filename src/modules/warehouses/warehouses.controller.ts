import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  create(@Body() createDto: CreateWarehouseDto) {
    return this.warehousesService.create(createDto.companyId, createDto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.warehousesService.findAll(
      companyId,
      page ? +page : 1,
      limit ? +limit : 20,
      search,
    );
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.warehousesService.findOne(companyId, id);
  }

  @Put(':id')
  update(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.warehousesService.remove(companyId, id);
  }
}
