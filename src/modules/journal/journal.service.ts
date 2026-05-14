import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../common/audit/audit.service';
import { PeriodsService } from '../periods/periods.service';

@Injectable()
export class JournalService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private periodsService: PeriodsService,
  ) {}

  // ================================================================
  // 1. CREATE JOURNAL ENTRY (The Heart of Double-Entry Accounting)
  // ================================================================
  async createJournalEntry(dto: CreateJournalEntryDto) {
    const { companyId, date, reference, description, status, lines } = dto;

    // Check if period is closed
    await this.periodsService.checkLock(companyId, date || new Date());

    // --- VALIDATION LAYER ---

    // 1. Company must exist
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // 2. Reference must be unique per company (if provided)
    if (reference) {
      const existingRef = await this.prisma.journalEntry.findUnique({
        where: { companyId_reference: { companyId, reference } },
      });
      if (existingRef) {
        throw new ConflictException(
          `Journal entry with reference "${reference}" already exists`,
        );
      }
    }

    // 3. At least 2 lines required
    if (lines.length < 2) {
      throw new BadRequestException(
        'A journal entry must have at least 2 lines',
      );
    }

    // 4. Each line must have either debit OR credit, not both, and not zero for both
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.debit > 0 && line.credit > 0) {
        throw new BadRequestException(
          `Line ${i + 1}: A journal line cannot have both debit and credit amounts. Split into separate lines.`,
        );
      }
      if (line.debit === 0 && line.credit === 0) {
        throw new BadRequestException(
          `Line ${i + 1}: A journal line must have either a debit or credit amount greater than zero.`,
        );
      }
    }

    // 5. THE GOLDEN RULE: Total Debits MUST equal Total Credits
    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

    // Use fixed-precision comparison to avoid floating point issues
    const debitsDecimal = new Decimal(totalDebits.toFixed(2));
    const creditsDecimal = new Decimal(totalCredits.toFixed(2));

    if (!debitsDecimal.equals(creditsDecimal)) {
      throw new BadRequestException(
        `Journal entry is unbalanced. Total Debits (${debitsDecimal.toFixed(2)}) ≠ Total Credits (${creditsDecimal.toFixed(2)}). ` +
          `Difference: ${debitsDecimal.minus(creditsDecimal).abs().toFixed(2)}`,
      );
    }

    // 6. Validate all account IDs exist and belong to the same company
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: {
        id: true,
        companyId: true,
        isActive: true,
        code: true,
        name: true,
      },
    });

    if (accounts.length !== accountIds.length) {
      const foundIds = new Set(accounts.map((a) => a.id));
      const missingIds = accountIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Account(s) not found: ${missingIds.join(', ')}`,
      );
    }

    for (const account of accounts) {
      if (account.companyId !== companyId) {
        throw new BadRequestException(
          `Account "${account.code} - ${account.name}" belongs to a different company`,
        );
      }
      if (!account.isActive) {
        throw new BadRequestException(
          `Account "${account.code} - ${account.name}" is inactive and cannot be used in journal entries`,
        );
      }
    }

    // --- TRANSACTION-SAFE DATABASE OPERATION ---
    // Everything runs inside a Prisma transaction — if any step fails, everything rolls back.
    return this.prisma.$transaction(async (tx) => {
      // Create the journal entry with all its lines atomically
      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId,
          date: date ? new Date(date) : new Date(),
          reference: reference || null,
          description,
          status: status || 'POSTED',
          lines: {
            create: lines.map((line) => ({
              accountId: line.accountId,
              description: line.description || null,
              debit: new Decimal(line.debit.toFixed(2)),
              credit: new Decimal(line.credit.toFixed(2)),
            })),
          },
        },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      });

      // If the entry is POSTED, update account balances
      if (journalEntry.status === 'POSTED') {
        await this.updateAccountBalances(tx, lines);
      }

      const result = {
        ...journalEntry,
        summary: {
          totalDebits: debitsDecimal.toFixed(2),
          totalCredits: creditsDecimal.toFixed(2),
          isBalanced: true,
          lineCount: lines.length,
        },
      };

      // Audit Log
      this.auditService.log({
        companyId,
        action: journalEntry.status === 'POSTED' ? 'POST' : 'CREATE',
        entity: 'JournalEntry',
        entityId: journalEntry.id,
        description: `Journal entry ${reference || journalEntry.id} ${journalEntry.status === 'POSTED' ? 'posted' : 'created as draft'} — Rs ${debitsDecimal.toFixed(2)}`,
      });

      return result;
    });
  }

  // ================================================================
  // 2. GET JOURNAL ENTRY BY ID
  // ================================================================
  async getJournalEntry(id: string, companyId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
          orderBy: { debit: 'desc' }, // Debits first, then credits
        },
      },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    if (entry.companyId !== companyId) {
      throw new BadRequestException(
        'Journal entry does not belong to this company',
      );
    }

    // Compute totals for the response
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);
    for (const line of entry.lines) {
      totalDebits = totalDebits.plus(line.debit);
      totalCredits = totalCredits.plus(line.credit);
    }

    return {
      ...entry,
      summary: {
        totalDebits: totalDebits.toFixed(2),
        totalCredits: totalCredits.toFixed(2),
        isBalanced: totalDebits.equals(totalCredits),
        lineCount: entry.lines.length,
      },
    };
  }

  // ================================================================
  // 3. LIST JOURNAL ENTRIES FOR A COMPANY (with pagination)
  // ================================================================
  async listJournalEntries(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100); // Cap at 100
    const skip = (page - 1) * limit;

    const where: any = { companyId };

    if (options.status) {
      where.status = options.status;
    }

    if (options.startDate || options.endDate) {
      where.date = {};
      if (options.startDate) where.date.gte = new Date(options.startDate);
      if (options.endDate) where.date.lte = new Date(options.endDate);
    }

    const [entries, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data: entries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ================================================================
  // 4. VOID A JOURNAL ENTRY (Accounting-safe — never delete)
  // ================================================================
  async voidJournalEntry(id: string, companyId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    if (entry.companyId !== companyId) {
      throw new BadRequestException(
        'Journal entry does not belong to this company',
      );
    }

    if (entry.status === 'VOIDED') {
      throw new BadRequestException('This journal entry is already voided');
    }

    // Check if period is closed
    await this.periodsService.checkLock(companyId, entry.date);

    if (entry.status === 'DRAFT') {
      throw new BadRequestException(
        'Draft entries cannot be voided. Delete them instead.',
      );
    }

    // Transaction: Void the entry and reverse account balances
    return this.prisma.$transaction(async (tx) => {
      // Reverse the balances (subtract what was added)
      await this.reverseAccountBalances(tx, entry.lines);

      // Mark entry as VOIDED
      const voidedEntry = await tx.journalEntry.update({
        where: { id },
        data: { status: 'VOIDED' },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      });

      // Audit Log
      this.auditService.log({
        companyId,
        action: 'VOID',
        entity: 'JournalEntry',
        entityId: id,
        description: `Journal entry "${entry.reference || entry.id}" voided`,
      });

      return {
        message: `Journal entry "${entry.reference || entry.id}" has been voided`,
        entry: voidedEntry,
      };
    });
  }

  // ================================================================
  // 5. POST A DRAFT JOURNAL ENTRY
  // ================================================================
  async postJournalEntry(id: string, companyId: string) {
    const entry = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    if (entry.companyId !== companyId) {
      throw new BadRequestException(
        'Journal entry does not belong to this company',
      );
    }

    if (entry.status !== 'DRAFT') {
      throw new BadRequestException(
        `Cannot post: Entry is already "${entry.status}"`,
      );
    }

    // Check if period is closed
    await this.periodsService.checkLock(companyId, entry.date);

    // Verify balance before posting
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);
    for (const line of entry.lines) {
      totalDebits = totalDebits.plus(line.debit);
      totalCredits = totalCredits.plus(line.credit);
    }

    if (!totalDebits.equals(totalCredits)) {
      throw new BadRequestException(
        `Cannot post: Entry is unbalanced. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Update account balances
      const lineData = entry.lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit),
        credit: Number(l.credit),
      }));
      await this.updateAccountBalances(tx, lineData);

      // Mark as POSTED
      const postedEntry = await tx.journalEntry.update({
        where: { id },
        data: { status: 'POSTED' },
        include: {
          lines: {
            include: {
              account: {
                select: { id: true, code: true, name: true, type: true },
              },
            },
          },
        },
      });

      return {
        message: `Journal entry "${entry.reference || entry.id}" has been posted`,
        entry: postedEntry,
      };
    });
  }

  // ================================================================
  // 6. DELETE A DRAFT JOURNAL ENTRY
  // ================================================================
  async deleteDraftEntry(id: string, companyId: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });

    if (!entry) {
      throw new NotFoundException('Journal entry not found');
    }

    if (entry.companyId !== companyId) {
      throw new BadRequestException(
        'Journal entry does not belong to this company',
      );
    }

    if (entry.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT entries can be deleted. Posted entries must be voided instead.',
      );
    }

    // Check if period is closed
    await this.periodsService.checkLock(companyId, entry.date);

    await this.prisma.journalEntry.delete({ where: { id } });
    return {
      message: `Draft journal entry "${entry.reference || entry.id}" has been deleted`,
    };
  }

  // ================================================================
  // 7. TRIAL BALANCE (Sum of all account balances)
  // ================================================================
  async getTrialBalance(companyId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId, isActive: true },
      orderBy: { code: 'asc' },
    });

    let grandTotalDebits = new Decimal(0);
    let grandTotalCredits = new Decimal(0);

    const trialBalanceRows = [];

    for (const account of accounts) {
      // Aggregate from posted journal lines
      const agg = await this.prisma.journalLine.aggregate({
        where: {
          accountId: account.id,
          journalEntry: { status: 'POSTED' },
        },
        _sum: { debit: true, credit: true },
      });

      const totalDebit = new Decimal(agg._sum.debit || 0);
      const totalCredit = new Decimal(agg._sum.credit || 0);

      // Skip accounts with no activity
      if (totalDebit.isZero() && totalCredit.isZero()) continue;

      // Compute normal balance
      let debitBalance = new Decimal(0);
      let creditBalance = new Decimal(0);

      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        const net = totalDebit.minus(totalCredit);
        if (net.greaterThanOrEqualTo(0)) {
          debitBalance = net;
        } else {
          creditBalance = net.abs();
        }
      } else {
        const net = totalCredit.minus(totalDebit);
        if (net.greaterThanOrEqualTo(0)) {
          creditBalance = net;
        } else {
          debitBalance = net.abs();
        }
      }

      grandTotalDebits = grandTotalDebits.plus(debitBalance);
      grandTotalCredits = grandTotalCredits.plus(creditBalance);

      trialBalanceRows.push({
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        accountType: account.type,
        debitBalance: debitBalance.toFixed(2),
        creditBalance: creditBalance.toFixed(2),
      });
    }

    return {
      companyId,
      generatedAt: new Date().toISOString(),
      rows: trialBalanceRows,
      totals: {
        totalDebits: grandTotalDebits.toFixed(2),
        totalCredits: grandTotalCredits.toFixed(2),
        isBalanced: grandTotalDebits.equals(grandTotalCredits),
        difference: grandTotalDebits.minus(grandTotalCredits).abs().toFixed(2),
      },
    };
  }

  // ================================================================
  // PRIVATE HELPERS — Account Balance Management
  // ================================================================

  /**
   * Updates cached account balances when a journal entry is POSTED.
   * ASSET & EXPENSE: balance += (debit - credit)
   * LIABILITY, EQUITY, REVENUE: balance += (credit - debit)
   */
  private async updateAccountBalances(
    tx: any,
    lines: { accountId: string; debit: number; credit: number }[],
  ) {
    // Group adjustments by accountId
    const adjustments = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const line of lines) {
      const existing = adjustments.get(line.accountId) || {
        debit: new Decimal(0),
        credit: new Decimal(0),
      };
      existing.debit = existing.debit.plus(new Decimal(line.debit.toFixed(2)));
      existing.credit = existing.credit.plus(
        new Decimal(line.credit.toFixed(2)),
      );
      adjustments.set(line.accountId, existing);
    }

    for (const [accountId, totals] of adjustments) {
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { type: true, balance: true },
      });

      if (!account) continue;

      let delta: Decimal;
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        delta = totals.debit.minus(totals.credit);
      } else {
        delta = totals.credit.minus(totals.debit);
      }

      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: new Decimal(account.balance).plus(delta),
        },
      });
    }
  }

  /**
   * Reverses cached account balances when a journal entry is VOIDED.
   * Opposite of updateAccountBalances.
   */
  private async reverseAccountBalances(
    tx: any,
    lines: { accountId: string; debit: any; credit: any }[],
  ) {
    const adjustments = new Map<string, { debit: Decimal; credit: Decimal }>();
    for (const line of lines) {
      const existing = adjustments.get(line.accountId) || {
        debit: new Decimal(0),
        credit: new Decimal(0),
      };
      existing.debit = existing.debit.plus(new Decimal(line.debit));
      existing.credit = existing.credit.plus(new Decimal(line.credit));
      adjustments.set(line.accountId, existing);
    }

    for (const [accountId, totals] of adjustments) {
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { type: true, balance: true },
      });

      if (!account) continue;

      // Reverse: subtract instead of add
      let delta: Decimal;
      if (account.type === 'ASSET' || account.type === 'EXPENSE') {
        delta = totals.debit.minus(totals.credit);
      } else {
        delta = totals.credit.minus(totals.debit);
      }

      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: new Decimal(account.balance).minus(delta),
        },
      });
    }
  }
}
