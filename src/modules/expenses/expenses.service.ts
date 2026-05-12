import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async createExpense(dto: CreateExpenseDto) {
    const { companyId, expenseAccountId, paymentAccountId, vendorId, amount, description, date, referenceNumber } = dto;

    // 1. Verify company
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    // 2. Verify accounts
    const expenseAcc = await this.prisma.account.findUnique({ where: { id: expenseAccountId } });
    const paymentAcc = await this.prisma.account.findUnique({ where: { id: paymentAccountId } });
    
    if (!expenseAcc || expenseAcc.companyId !== companyId) throw new BadRequestException('Invalid expense account');
    if (!paymentAcc || paymentAcc.companyId !== companyId) throw new BadRequestException('Invalid payment account');
    
    // Typically Expense account type is EXPENSE and Payment account type is ASSET (Cash/Bank)
    if (expenseAcc.type !== 'EXPENSE') throw new BadRequestException('Expense account must be of type EXPENSE');
    if (paymentAcc.type !== 'ASSET' && paymentAcc.type !== 'LIABILITY') throw new BadRequestException('Payment account must be ASSET or LIABILITY');

    // 3. Verify vendor if provided
    if (vendorId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor || vendor.companyId !== companyId) throw new BadRequestException('Invalid vendor');
    }

    const expenseAmount = new Decimal(amount);

    return this.prisma.$transaction(async (tx) => {
      // 4. Create balanced journal lines
      const journalLines = [
        {
          accountId: expenseAccountId,
          description: `Expense: ${description}`,
          debit: expenseAmount,
          credit: new Decimal(0),
        },
        {
          accountId: paymentAccountId,
          description: `Payment for: ${description}`,
          debit: new Decimal(0),
          credit: expenseAmount,
        }
      ];

      // 5. Create Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId,
          date: date ? new Date(date) : new Date(),
          reference: referenceNumber || null,
          description: `Auto-posted entry for expense: ${description}`,
          status: 'POSTED',
          lines: { create: journalLines },
        },
        include: { lines: true }
      });

      // 6. Update Account Balances
      for (const line of journalEntry.lines) {
        const account = await tx.account.findUnique({ where: { id: line.accountId } });
        if (account) {
          let delta: Decimal;
          if (account.type === 'ASSET' || account.type === 'EXPENSE') {
            delta = new Decimal(line.debit).minus(new Decimal(line.credit));
          } else {
            delta = new Decimal(line.credit).minus(new Decimal(line.debit));
          }
          await tx.account.update({
            where: { id: account.id },
            data: { balance: new Decimal(account.balance).plus(delta) },
          });
        }
      }

      // 7. Create the Expense record
      const expense = await tx.expense.create({
        data: {
          companyId,
          vendorId,
          journalEntryId: journalEntry.id,
          expenseAccountId,
          paymentAccountId,
          referenceNumber,
          date: date ? new Date(date) : new Date(),
          amount: expenseAmount,
          description,
          status: 'PAID',
        },
      });

      // 8. Audit Log
      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'Expense',
        entityId: expense.id,
        description: `Expense recorded: ${description} — Rs ${amount}`,
      });

      return expense;
    });
  }

  async findAll(companyId: string, limit = 50) {
    return this.prisma.expense.findMany({
      where: { companyId },
      include: {
        vendor: { select: { id: true, name: true } }
      },
      orderBy: { date: 'desc' },
      take: limit,
    });
  }
}
