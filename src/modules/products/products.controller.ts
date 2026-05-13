import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@CurrentCompany() companyId: string, @Body() createDto: CreateProductDto) {
    return this.productsService.create(companyId, createDto);
  }

  @Get()
  findAll(
    @CurrentCompany() companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.productsService.findAll(companyId, page ? Number(page) : 1, limit ? Number(limit) : 20, search);
  }

  @Get(':id')
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.findOne(companyId, id);
  }

  @Patch(':id')
  update(@CurrentCompany() companyId: string, @Param('id') id: string, @Body() updateDto: UpdateProductDto) {
    return this.productsService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.productsService.remove(companyId, id);
  }
}
