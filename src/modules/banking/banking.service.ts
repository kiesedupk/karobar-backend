import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { Decimal } from '@prisma/client/runtime/library';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  CreateTransferDto,
  AdjustBalanceDto,
} from './dto/banking.dto';

@Injectable()
export class BankingService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ================================================================
  // 1. BANK ACCOUNT MANAGEMENT
  // ================================================================

  async createBankAccount(dto: CreateBankAccountDto) {
    const { companyId, glAccountId, name, openingBalance } = dto;

    // Validate company
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    // Validate GL account belongs to company and is an asset type
    const glAccount = await this.prisma.account.findUnique({ where: { id: glAccountId } });
    if (!glAccount) throw new NotFoundException('GL Account not found');
    if (glAccount.companyId !== companyId) throw new BadRequestException('GL Account does not belong to this company');
    if (glAccount.type !== 'ASSET') throw new BadRequestException('GL Account must be an ASSET type (BANK or CASH account)');

    // Prevent duplicate links to same GL account
    const existing = await this.prisma.bankAccount.findFirst({
      where: { companyId, glAccountId },
    });
    if (existing) throw new ConflictException(`A bank account is already linked to GL Account "${glAccount.name}"`);

    const opening = new Decimal(openingBalance || 0);

    return this.prisma.$transaction(async (tx) => {
      // Create the bank account
      const bankAccount = await tx.bankAccount.create({
        data: {
          companyId,
          glAccountId,
          name,
          accountNumber: dto.accountNumber,
          bankName: dto.bankName,
          branchName: dto.branchName,
          branchCode: dto.branchCode,
          accountType: dto.accountType || 'BANK',
          currency: dto.currency || company.currency || 'PKR',
          openingBalance: opening,
          currentBalance: opening,
          description: dto.description,
          isActive: true,
        },
        include: {
          company: { select: { id: true, name: true, currency: true } },
        },
      });

      // If opening balance > 0, post an opening journal entry
      if (opening.greaterThan(0)) {
        // Find equity/owner's capital account as counterpart
        const equityAccount = await tx.account.findFirst({
          where: { companyId, type: 'EQUITY' },
        });

        if (equityAccount) {
          const ref = `OPEN-${bankAccount.id.slice(-6).toUpperCase()}`;
          const journalEntry = await tx.journalEntry.create({
            data: {
              companyId,
              date: new Date(),
              reference: ref,
              description: `Opening balance — ${name}`,
              status: 'POSTED',
              lines: {
                create: [
                  {
                    accountId: glAccountId,
                    description: `Opening balance — ${name}`,
                    debit: opening,
                    credit: new Decimal(0),
                  },
                  {
                    accountId: equityAccount.id,
                    description: `Opening balance entry — ${name}`,
                    debit: new Decimal(0),
                    credit: opening,
                  },
                ],
              },
            },
          });

          // Update GL account balances
          await tx.account.update({
            where: { id: glAccountId },
            data: { balance: new Decimal(glAccount.balance).plus(opening) },
          });
          await tx.account.update({
            where: { id: equityAccount.id },
            data: { balance: new Decimal(equityAccount.balance).plus(opening) },
          });

          // Record opening transaction
          await tx.bankTransaction.create({
            data: {
              companyId,
              bankAccountId: bankAccount.id,
              journalEntryId: journalEntry.id,
              type: 'CREDIT',
              category: 'OPENING',
              amount: opening,
              runningBalance: opening,
              transactionDate: new Date(),
              description: `Opening balance`,
            },
          });
        }
      }

      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'BankAccount',
        entityId: bankAccount.id,
        description: `Bank account "${name}" created with opening balance ${opening.toFixed(2)}`,
      });

      return bankAccount;
    });
  }

  async listBankAccounts(companyId: string, includeInactive = false) {
    const where: any = { companyId };
    if (!includeInactive) where.isActive = true;

    const accounts = await this.prisma.bankAccount.findMany({
      where,
      orderBy: [{ accountType: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { transactionsFrom: true } },
      },
    });

    const totalBalance = accounts.reduce(
      (sum, acc) => sum.plus(new Decimal(acc.currentBalance)),
      new Decimal(0),
    );

    return {
      data: accounts.map((acc) => ({
        ...acc,
        currentBalance: new Decimal(acc.currentBalance).toFixed(2),
        openingBalance: new Decimal(acc.openingBalance).toFixed(2),
        transactionCount: acc._count.transactionsFrom,
      })),
      summary: {
        totalAccounts: accounts.length,
        totalBalance: totalBalance.toFixed(2),
        bankAccounts: accounts.filter((a) => a.accountType === 'BANK').length,
        cashAccounts: accounts.filter((a) => a.accountType === 'CASH').length,
        mobileWallets: accounts.filter((a) => a.accountType === 'MOBILE_WALLET').length,
      },
    };
  }

  async getBankAccount(id: string, companyId: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
      include: {
        transactionsFrom: {
          orderBy: { transactionDate: 'desc' },
          take: 10,
        },
      },
    });

    if (!account) throw new NotFoundException('Bank account not found');
    if (account.companyId !== companyId) throw new BadRequestException('Account does not belong to this company');

    return {
      ...account,
      currentBalance: new Decimal(account.currentBalance).toFixed(2),
      openingBalance: new Decimal(account.openingBalance).toFixed(2),
    };
  }

  async updateBankAccount(id: string, companyId: string, dto: UpdateBankAccountDto) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account.companyId !== companyId) throw new BadRequestException('Account does not belong to this company');

    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        name: dto.name ?? account.name,
        accountNumber: dto.accountNumber ?? account.accountNumber,
        bankName: dto.bankName ?? account.bankName,
        branchName: dto.branchName ?? account.branchName,
        branchCode: dto.branchCode ?? account.branchCode,
        description: dto.description ?? account.description,
        isActive: dto.isActive ?? account.isActive,
      },
    });
  }

  // ================================================================
  // 2. TRANSFERS BETWEEN ACCOUNTS
  // ================================================================

  async createTransfer(dto: CreateTransferDto) {
    const { companyId, fromAccountId, toAccountId, amount, description, reference, transferDate } = dto;

    if (fromAccountId === toAccountId) throw new BadRequestException('Cannot transfer to the same account');

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.bankAccount.findUnique({ where: { id: fromAccountId } }),
      this.prisma.bankAccount.findUnique({ where: { id: toAccountId } }),
    ]);

    if (!fromAccount) throw new NotFoundException('Source account not found');
    if (!toAccount) throw new NotFoundException('Destination account not found');
    if (fromAccount.companyId !== companyId) throw new BadRequestException('Source account does not belong to this company');
    if (toAccount.companyId !== companyId) throw new BadRequestException('Destination account does not belong to this company');
    if (!fromAccount.isActive) throw new BadRequestException('Source account is inactive');
    if (!toAccount.isActive) throw new BadRequestException('Destination account is inactive');

    const transferAmount = new Decimal(amount);
    const fromBalance = new Decimal(fromAccount.currentBalance);

    if (fromBalance.lessThan(transferAmount)) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${fromBalance.toFixed(2)}, Requested: ${transferAmount.toFixed(2)}`,
      );
    }

    const txDate = transferDate ? new Date(transferDate) : new Date();
    const ref = reference || `TRF-${Date.now()}`;
    const desc = description || `Transfer from ${fromAccount.name} to ${toAccount.name}`;

    return this.prisma.$transaction(async (tx) => {
      // Get GL accounts for both
      const [fromGL, toGL] = await Promise.all([
        tx.account.findUnique({ where: { id: fromAccount.glAccountId } }),
        tx.account.findUnique({ where: { id: toAccount.glAccountId } }),
      ]);

      // Create balanced journal entry: Credit source GL, Debit destination GL
      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId,
          date: txDate,
          reference: ref,
          description: desc,
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: toAccount.glAccountId,
                description: `Transfer in — ${toAccount.name}`,
                debit: transferAmount,
                credit: new Decimal(0),
              },
              {
                accountId: fromAccount.glAccountId,
                description: `Transfer out — ${fromAccount.name}`,
                debit: new Decimal(0),
                credit: transferAmount,
              },
            ],
          },
        },
      });

      // Update GL account balances (both are ASSET, debit increases, credit decreases)
      if (fromGL) {
        await tx.account.update({
          where: { id: fromAccount.glAccountId },
          data: { balance: new Decimal(fromGL.balance).minus(transferAmount) },
        });
      }
      if (toGL) {
        await tx.account.update({
          where: { id: toAccount.glAccountId },
          data: { balance: new Decimal(toGL.balance).plus(transferAmount) },
        });
      }

      // Update bank account balances
      const newFromBalance = fromBalance.minus(transferAmount);
      const newToBalance = new Decimal(toAccount.currentBalance).plus(transferAmount);

      await tx.bankAccount.update({
        where: { id: fromAccountId },
        data: { currentBalance: newFromBalance },
      });
      await tx.bankAccount.update({
        where: { id: toAccountId },
        data: { currentBalance: newToBalance },
      });

      // Record transactions for both accounts
      await tx.bankTransaction.createMany({
        data: [
          {
            companyId,
            bankAccountId: fromAccountId,
            oppositeAccountId: toAccountId,
            journalEntryId: journalEntry.id,
            type: 'DEBIT',
            category: 'TRANSFER',
            amount: transferAmount,
            runningBalance: newFromBalance,
            transactionDate: txDate,
            description: desc,
            reference: ref,
          },
          {
            companyId,
            bankAccountId: toAccountId,
            oppositeAccountId: fromAccountId,
            journalEntryId: journalEntry.id,
            type: 'CREDIT',
            category: 'TRANSFER',
            amount: transferAmount,
            runningBalance: newToBalance,
            transactionDate: txDate,
            description: desc,
            reference: ref,
          },
        ],
      });

      // Record the transfer
      const transfer = await tx.transfer.create({
        data: {
          companyId,
          fromAccountId,
          toAccountId,
          journalEntryId: journalEntry.id,
          amount: transferAmount,
          transferDate: txDate,
          reference: ref,
          description: desc,
          status: 'COMPLETED',
        },
        include: {
          fromAccount: { select: { id: true, name: true } },
          toAccount: { select: { id: true, name: true } },
        },
      });

      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'Transfer',
        entityId: transfer.id,
        description: `Transfer of ${transferAmount.toFixed(2)} from "${fromAccount.name}" to "${toAccount.name}"`,
      });

      return {
        transfer,
        journalEntryId: journalEntry.id,
        fromBalance: newFromBalance.toFixed(2),
        toBalance: newToBalance.toFixed(2),
      };
    });
  }

  async listTransfers(companyId: string, options: { page?: number; limit?: number; accountId?: string }) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (options.accountId) {
      where.OR = [{ fromAccountId: options.accountId }, { toAccountId: options.accountId }];
    }

    const [transfers, total] = await Promise.all([
      this.prisma.transfer.findMany({
        where,
        include: {
          fromAccount: { select: { id: true, name: true, accountType: true } },
          toAccount: { select: { id: true, name: true, accountType: true } },
        },
        orderBy: { transferDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transfer.count({ where }),
    ]);

    return {
      data: transfers.map((t) => ({ ...t, amount: new Decimal(t.amount).toFixed(2) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ================================================================
  // 3. TRANSACTION HISTORY
  // ================================================================

  async getTransactionHistory(
    bankAccountId: string,
    companyId: string,
    options: { page?: number; limit?: number; type?: string },
  ) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account.companyId !== companyId) throw new BadRequestException('Account does not belong to this company');

    const page = options.page || 1;
    const limit = Math.min(options.limit || 30, 100);
    const skip = (page - 1) * limit;

    const where: any = { bankAccountId };
    if (options.type) where.type = options.type;

    const [transactions, total] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where,
        include: {
          oppositeAccount: { select: { id: true, name: true } },
        },
        orderBy: { transactionDate: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);

    return {
      account: {
        id: account.id,
        name: account.name,
        accountType: account.accountType,
        currentBalance: new Decimal(account.currentBalance).toFixed(2),
      },
      data: transactions.map((t) => ({
        ...t,
        amount: new Decimal(t.amount).toFixed(2),
        runningBalance: new Decimal(t.runningBalance).toFixed(2),
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ================================================================
  // 4. BALANCE ADJUSTMENT
  // ================================================================

  async adjustBalance(dto: AdjustBalanceDto) {
    const { companyId, bankAccountId, amount, description, reference } = dto;

    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException('Bank account not found');
    if (account.companyId !== companyId) throw new BadRequestException('Account does not belong to this company');

    const adjustAmount = new Decimal(amount);
    const currentBalance = new Decimal(account.currentBalance);
    const newBalance = currentBalance.plus(adjustAmount);

    return this.prisma.$transaction(async (tx) => {
      const glAccount = await tx.account.findUnique({ where: { id: account.glAccountId } });

      // Post adjustment journal entry
      const isPositive = adjustAmount.greaterThan(0);
      const absAmount = adjustAmount.abs();
      const adjRef = reference || `ADJ-${Date.now()}`;

      // Find suspense/adjustment account or use equity
      const counterAccount = await tx.account.findFirst({
        where: { companyId, OR: [{ code: '9999' }, { type: 'EQUITY' }] },
      });

      if (counterAccount) {
        const journalLines: any[] = isPositive
          ? [
              { accountId: account.glAccountId, debit: absAmount, credit: new Decimal(0), description },
              { accountId: counterAccount.id, debit: new Decimal(0), credit: absAmount, description: `Adjustment — ${account.name}` },
            ]
          : [
              { accountId: counterAccount.id, debit: absAmount, credit: new Decimal(0), description: `Adjustment — ${account.name}` },
              { accountId: account.glAccountId, debit: new Decimal(0), credit: absAmount, description },
            ];

        await tx.journalEntry.create({
          data: {
            companyId,
            date: new Date(),
            reference: adjRef,
            description: `Balance adjustment — ${account.name}`,
            status: 'POSTED',
            lines: { create: journalLines },
          },
        });

        // Update GL balance
        if (glAccount) {
          await tx.account.update({
            where: { id: account.glAccountId },
            data: { balance: new Decimal(glAccount.balance).plus(adjustAmount) },
          });
        }
      }

      // Update bank account balance
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: { currentBalance: newBalance },
      });

      // Record transaction
      await tx.bankTransaction.create({
        data: {
          companyId,
          bankAccountId,
          type: isPositive ? 'CREDIT' : 'DEBIT',
          category: 'ADJUSTMENT',
          amount: absAmount,
          runningBalance: newBalance,
          transactionDate: new Date(),
          description,
          reference: adjRef,
        },
      });

      return {
        message: `Balance adjusted by ${adjustAmount.toFixed(2)}`,
        previousBalance: currentBalance.toFixed(2),
        newBalance: newBalance.toFixed(2),
      };
    });
  }

  // ================================================================
  // 5. SUMMARY & BALANCES
  // ================================================================

  async getBalanceSummary(companyId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ accountType: 'asc' }, { currentBalance: 'desc' }],
    });

    const grouped: Record<string, any[]> = { BANK: [], CASH: [], MOBILE_WALLET: [] };
    let grandTotal = new Decimal(0);

    for (const acc of accounts) {
      const bal = new Decimal(acc.currentBalance);
      grandTotal = grandTotal.plus(bal);
      if (!grouped[acc.accountType]) grouped[acc.accountType] = [];
      grouped[acc.accountType].push({
        id: acc.id,
        name: acc.name,
        bankName: acc.bankName,
        accountNumber: acc.accountNumber,
        currency: acc.currency,
        currentBalance: bal.toFixed(2),
      });
    }

    return {
      grandTotal: grandTotal.toFixed(2),
      byType: {
        bank: {
          accounts: grouped.BANK,
          total: grouped.BANK.reduce((s, a) => s.plus(new Decimal(a.currentBalance)), new Decimal(0)).toFixed(2),
        },
        cash: {
          accounts: grouped.CASH,
          total: grouped.CASH.reduce((s, a) => s.plus(new Decimal(a.currentBalance)), new Decimal(0)).toFixed(2),
        },
        mobileWallet: {
          accounts: grouped.MOBILE_WALLET,
          total: grouped.MOBILE_WALLET.reduce((s, a) => s.plus(new Decimal(a.currentBalance)), new Decimal(0)).toFixed(2),
        },
      },
    };
  }
}
