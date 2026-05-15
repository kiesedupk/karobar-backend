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
import { ProductCategoriesService } from './product-categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class ProductCategoriesController {
  constructor(private readonly categoriesService: ProductCategoriesService) {}

  @Post()
  create(@Body() createDto: CreateCategoryDto) {
    return this.categoriesService.create(createDto.companyId, createDto);
  }

  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.categoriesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.categoriesService.findOne(companyId, id);
  }

  @Patch(':id')
  update(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body() updateDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(companyId, id, updateDto);
  }

  @Delete(':id')
  remove(@Query('companyId') companyId: string, @Param('id') id: string) {
    return this.categoriesService.remove(companyId, id);
  }
}
