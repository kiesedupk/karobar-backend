import { Controller, Get, Post, Body, Param, Query, UseGuards, Put } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePosSessionDto, PosCheckoutDto } from './dto/pos.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Post('session/open')
  openSession(
    @Query('companyId') companyId: string,
    @CurrentUser() user: any,
    @Body() dto: CreatePosSessionDto,
  ) {
    return this.posService.openSession(companyId, user.id, dto);
  }

  @Post('session/:id/close')
  closeSession(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body('closingBalance') closingBalance: number,
    @Body('notes') notes?: string,
  ) {
    return this.posService.closeSession(companyId, id, closingBalance, notes);
  }

  @Get('session/active')
  getActiveSession(
    @Query('companyId') companyId: string,
    @CurrentUser() user: any,
  ) {
    return this.posService.getActiveSession(companyId, user.id);
  }

  @Post('checkout')
  checkout(
    @Query('companyId') companyId: string,
    @CurrentUser() user: any,
    @Body() dto: PosCheckoutDto,
  ) {
    return this.posService.checkout(companyId, user.id, dto);
  }
}
