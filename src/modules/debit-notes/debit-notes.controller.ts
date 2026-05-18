import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { DebitNotesService } from './debit-notes.service';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('debit-notes')
export class DebitNotesController {
  constructor(private readonly debitNotesService: DebitNotesService) {}

  @Permissions('invoices:write')
  @Post()
  create(@Body() dto: CreateDebitNoteDto, @Query('companyId') companyId: string) {
    dto.companyId = companyId;
    return this.debitNotesService.create(dto);
  }

  @Permissions('invoices:read')
  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.debitNotesService.findAll(companyId);
  }

  @Permissions('invoices:read')
  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.debitNotesService.findOne(id, companyId);
  }
}
