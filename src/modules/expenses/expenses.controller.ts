import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@Controller('expenses')
@UseGuards(JwtAuthGuard, TenantRoleGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Permissions('expense:create')
  create(@Body() createExpenseDto: CreateExpenseDto) {
    return this.expensesService.createExpense(createExpenseDto);
  }

  @Get()
  @Permissions('expense:read')
  findAll(
    @Query('companyId') companyId: string,
    @Query('limit') limit?: string,
  ) {
    return this.expensesService.findAll(
      companyId,
      limit ? parseInt(limit) : 50,
    );
  }
}
