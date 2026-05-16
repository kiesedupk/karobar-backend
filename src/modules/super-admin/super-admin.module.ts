import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [SuperAdminController],
  providers: [SuperAdminService, SuperAdminGuard, PrismaService],
})
export class SuperAdminModule {}
