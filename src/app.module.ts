import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { JournalModule } from './modules/journal/journal.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CustomersModule } from './modules/customers/customers.module';
import { VendorsModule } from './modules/vendors/vendors.module';

@Module({
  imports: [
    PrismaModule, AuthModule, UsersModule, CompaniesModule,
    AccountingModule, JournalModule, InvoicesModule, ReportsModule,
    CustomersModule, VendorsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
