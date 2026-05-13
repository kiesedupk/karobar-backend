import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProductCategoriesService } from './product-categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentCompany } from '../../common/decorators/current-company.decorator';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class ProductCategoriesController {
  constructor(private readonly categoriesService: ProductCategoriesService) {}

  @Post()
  create(@CurrentCompany() companyId: string, @Body() createDto: CreateCategoryDto) {
    return this.categoriesService.create(companyId, createDto);
  }

  @Get()
  findAll(@CurrentCompany() companyId: string) {
    return this.categoriesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(companyId, id);
  }

  @Patch(':id')
  update(@CurrentCompany() companyId: string, @Param('id') id: string, @Body() updateDto: UpdateCategoryDto) {
    return this.categoriesService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@CurrentCompany() companyId: string, @Param('id') id: string) {
    return this.categoriesService.remove(companyId, id);
  }
}
