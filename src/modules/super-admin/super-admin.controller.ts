import { Controller, Get, Patch, Delete, Post, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
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

  // ── Phase 2 Endpoints ─────────────────────────────────────────────────

  @Delete('companies/:id')
  deleteCompany(@Param('id') id: string) {
    return this.service.deleteCompany(id);
  }

  @Get('users')
  getAllUsers(@Query('companyId') companyId?: string) {
    return this.service.getAllUsers(companyId);
  }

  @Patch('users/:id/toggle')
  toggleUserActive(@Param('id') id: string) {
    return this.service.toggleUserActive(id);
  }

  @Patch('users/:id/password')
  resetPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.service.resetUserPassword(id, password);
  }

  @Post('companies/:id/login-as')
  loginAsCompany(@Param('id') id: string, @Req() req: any) {
    return this.service.loginAsCompany(id, req.user.sub);
  }

  @Post('expire-trials')
  manualExpireTrials() {
    return this.service.expireTrials();
  }
}

