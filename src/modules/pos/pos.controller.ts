import { Controller, Get, Post, Body, Param, Query, UseGuards, Put } from '@nestjs/common';
import { PosService } from './pos.service';
import { CreatePosSessionDto, PosCheckoutDto, ClosePosSessionDto } from './dto/pos.dto';
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

  @Get('session/:id/summary')
  getSessionSummary(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.posService.getSessionSummary(companyId, id);
  }

  @Post('session/:id/close')
  closeSession(
    @Query('companyId') companyId: string,
    @Param('id') id: string,
    @Body() dto: ClosePosSessionDto,
  ) {
    return this.posService.closeSession(companyId, id, dto);
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
