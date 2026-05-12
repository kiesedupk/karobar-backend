import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JournalService } from './journal.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  // ========================================
  // JOURNAL ENTRY OPERATIONS
  // ========================================

  /**
   * POST /journal/entries
   * Create a new journal entry with balanced debit/credit lines.
   * The golden rule is enforced: Total Debits = Total Credits.
   */
  @Permissions('journal:create')
  @Post('entries')
  createJournalEntry(@Body() dto: CreateJournalEntryDto) {
    return this.journalService.createJournalEntry(dto);
  }

  /**
   * GET /journal/entries?companyId=xxx&page=1&limit=20&status=POSTED&startDate=...&endDate=...
   * List journal entries with pagination and optional filters.
   */
  @Permissions('journal:read')
  @Get('entries')
  listJournalEntries(
    @Query('companyId') companyId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.journalService.listJournalEntries(companyId, {
      page,
      limit,
      status,
      startDate,
      endDate,
    });
  }

  /**
   * GET /journal/entries/:id?companyId=xxx
   * Get a single journal entry with all its lines and account details.
   */
  @Permissions('journal:read')
  @Get('entries/:id')
  getJournalEntry(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.journalService.getJournalEntry(id, companyId);
  }

  /**
   * POST /journal/entries/:id/post?companyId=xxx
   * Post a DRAFT journal entry — makes it permanent and updates account balances.
   */
  @Permissions('journal:post')
  @Post('entries/:id/post')
  postJournalEntry(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.journalService.postJournalEntry(id, companyId);
  }

  /**
   * POST /journal/entries/:id/void?companyId=xxx
   * Void a POSTED journal entry — reverses account balances.
   * Accounting-safe: entries are never deleted, only voided.
   */
  @Permissions('journal:delete')
  @Post('entries/:id/void')
  voidJournalEntry(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.journalService.voidJournalEntry(id, companyId);
  }

  /**
   * DELETE /journal/entries/:id?companyId=xxx
   * Delete a DRAFT journal entry only. Posted entries must be voided.
   */
  @Permissions('journal:delete')
  @Delete('entries/:id')
  deleteDraftEntry(
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.journalService.deleteDraftEntry(id, companyId);
  }

  // ========================================
  // REPORTS
  // ========================================

  /**
   * GET /journal/trial-balance?companyId=xxx
   * Generate a Trial Balance report.
   * Verifies the fundamental equation: Total Debits = Total Credits.
   */
  @Permissions('report:read')
  @Get('trial-balance')
  getTrialBalance(@Query('companyId') companyId: string) {
    return this.journalService.getTrialBalance(companyId);
  }
}
