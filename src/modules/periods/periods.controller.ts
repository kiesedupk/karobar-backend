import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PeriodsService } from './periods.service';
import { CreateFiscalYearDto, ClosePeriodDto } from './dto/periods.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('periods')
export class PeriodsController {
  constructor(private readonly periodsService: PeriodsService) {}

  @Permissions('period:create')
  @Post('fiscal-years')
  createFiscalYear(@Body() dto: CreateFiscalYearDto) {
    return this.periodsService.createFiscalYear(dto);
  }

  @Permissions('period:read')
  @Get('fiscal-years')
  listFiscalYears(@Query('companyId') companyId: string) {
    return this.periodsService.listFiscalYears(companyId);
  }

  @Permissions('period:read')
  @Get()
  listPeriods(
    @Query('companyId') companyId: string,
    @Query('fiscalYearId') fiscalYearId?: string,
  ) {
    return this.periodsService.listPeriods(companyId, fiscalYearId);
  }

  @Permissions('period:update')
  @Post('close')
  closePeriod(@Body() dto: ClosePeriodDto, @Request() req: any) {
    return this.periodsService.closePeriod(dto, req.user.id);
  }
}
