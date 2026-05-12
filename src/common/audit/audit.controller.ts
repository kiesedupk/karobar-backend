import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { TenantRoleGuard } from '../guards/tenant-role.guard';
import { Permissions } from '../decorators/permissions.decorator';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, TenantRoleGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions('audit:read')
  findAll(
    @Query('companyId') companyId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('entity') entity?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
  ) {
    return this.auditService.findAll(companyId, {
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      entity,
      action,
      userId,
    });
  }
}
