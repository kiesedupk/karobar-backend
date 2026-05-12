import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
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
import { TenantMiddleware } from './common/tenant-context/tenant.middleware';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { AuditModule } from './common/audit/audit.module';
import { ScheduleModule } from '@nestjs/schedule';
import { BankingModule } from './modules/banking/banking.module';

@Module({
  imports: [
    PrismaModule, AuthModule, UsersModule, CompaniesModule,
    AccountingModule, JournalModule, InvoicesModule, ReportsModule,
    CustomersModule, VendorsModule, ExpensesModule, AuditModule,
    ScheduleModule.forRoot(), BankingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply Multi-Tenant Middleware globally to all routes
    consumer
      .apply(TenantMiddleware)
      .forRoutes('*');
  }
}
