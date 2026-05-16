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

  // ── Phase 3 Endpoints ─────────────────────────────────────────────────

  @Get('activity-logs')
  getActivityLogs(
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getActivityLogs({
      action,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  @Get('revenue')
  getRevenueDashboard() {
    return this.service.getRevenueDashboard();
  }

  @Get('usage')
  getUsageStats() {
    return this.service.getUsageStats();
  }

  @Get('health')
  getSystemHealth() {
    return this.service.getSystemHealth();
  }

  // ── Phase 4 Endpoints (Billing) ───────────────────────────────────────

  @Post('payments')
  recordPayment(@Body() body: any, @Req() req: any) {
    return this.service.recordPayment({ ...body, recordedBy: req.user.sub });
  }

  @Get('payments')
  getPayments(@Query('companyId') companyId?: string) {
    return this.service.getPayments(companyId);
  }

  @Post('companies/:id/invoice')
  generateInvoice(@Param('id') id: string) {
    return this.service.generateInvoice(id);
  }

  @Post('coupons')
  createCoupon(@Body() body: any) {
    return this.service.createCoupon(body);
  }

  @Get('coupons')
  getCoupons() {
    return this.service.getCoupons();
  }

  @Patch('coupons/:id/toggle')
  toggleCoupon(@Param('id') id: string) {
    return this.service.toggleCoupon(id);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Param('id') id: string) {
    return this.service.deleteCoupon(id);
  }

  // ── Phase 5 Endpoints (Communication) ─────────────────────────────────

  @Post('broadcast-email')
  broadcastEmail(@Body() body: { subject: string; message: string; filter?: string }) {
    return this.service.broadcastEmail(body.subject, body.message, body.filter);
  }

  @Post('announcements')
  createAnnouncement(@Body() body: any) {
    return this.service.createAnnouncement(body);
  }

  @Get('announcements')
  getAnnouncements() {
    return this.service.getAnnouncements();
  }

  @Patch('announcements/:id/toggle')
  toggleAnnouncement(@Param('id') id: string) {
    return this.service.toggleAnnouncement(id);
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@Param('id') id: string) {
    return this.service.deleteAnnouncement(id);
  }
}

// Public endpoint for active announcements (no guard)
import { Controller as C2 } from '@nestjs/common';
@C2('announcements')
export class AnnouncementsPublicController {
  constructor(private readonly service: SuperAdminService) {}

  @Get('active')
  getActive() {
    return this.service.getActiveAnnouncements();
  }
}
