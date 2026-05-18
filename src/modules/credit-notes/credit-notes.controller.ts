import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CreditNotesService } from './credit-notes.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantRoleGuard } from '../../common/guards/tenant-role.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, TenantRoleGuard)
@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Permissions('invoices:write')
  @Post()
  create(@Body() dto: CreateCreditNoteDto, @Query('companyId') companyId: string) {
    dto.companyId = companyId;
    return this.creditNotesService.create(dto);
  }

  @Permissions('invoices:read')
  @Get()
  findAll(@Query('companyId') companyId: string) {
    return this.creditNotesService.findAll(companyId);
  }

  @Permissions('invoices:read')
  @Get(':id')
  findOne(@Param('id') id: string, @Query('companyId') companyId: string) {
    return this.creditNotesService.findOne(id, companyId);
  }
}
