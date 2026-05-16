import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
@UseGuards(SuperAdminGuard)
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('stats')
  getStats() {
    return this.service.getStats();
  }

  @Get('companies')
  getAllCompanies(@Query('search') search?: string) {
    return this.service.getAllCompanies(search);
  }

  @Get('companies/:id')
  getCompany(@Param('id') id: string) {
    return this.service.getCompany(id);
  }

  @Patch('companies/:id/trial')
  extendTrial(@Param('id') id: string, @Body('days') days: number) {
    return this.service.extendTrial(id, days);
  }

  @Patch('companies/:id/suspend')
  suspendCompany(@Param('id') id: string, @Body('reason') reason: string) {
    return this.service.suspendCompany(id, reason || 'Suspended by admin');
  }

  @Patch('companies/:id/activate')
  activateCompany(@Param('id') id: string) {
    return this.service.activateCompany(id);
  }

  @Patch('companies/:id/plan')
  changePlan(@Param('id') id: string, @Body('plan') plan: string) {
    return this.service.changePlan(id, plan);
  }

  @Patch('companies/:id/notes')
  updateNotes(@Param('id') id: string, @Body('notes') notes: string) {
    return this.service.updateNotes(id, notes);
  }
}
