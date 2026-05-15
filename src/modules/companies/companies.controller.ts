import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AddUserDto } from './dto/add-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(@Body() createCompanyDto: CreateCompanyDto, @CurrentUser() user: any) {
    // Override the userId with the authenticated user's ID
    return this.companiesService.create({
      ...createCompanyDto,
      userId: user.id,
    });
  }

  @Get()
  findAllForUser(@CurrentUser() user: any) {
    return this.companiesService.findAllForUser(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, updateCompanyDto);
  }

  @Get(':id/roles')
  getRoles(@Param('id') id: string) {
    return this.companiesService.getRoles(id);
  }

  @Post(':id/users')
  addUser(
    @Param('id') id: string,
    @Body() addUserDto: AddUserDto,
  ) {
    return this.companiesService.addUser(id, addUserDto);
  }
}
