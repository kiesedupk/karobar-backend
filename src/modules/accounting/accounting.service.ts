import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Decimal } from '@prisma/client/runtime/library';

// =====================================================
// Default Chart of Accounts template for new companies
// Based on Pakistani accounting standards
// =====================================================
const DEFAULT_CHART_OF_ACCOUNTS = [
  // ASSETS (1000 series)
  { code: '1000', name: 'Assets', type: 'ASSET', subType: 'HEADER' },
  {
    code: '1010',
    name: 'Cash on Hand',
    type: 'ASSET',
    subType: 'CASH',
    parentCode: '1000',
  },
  {
    code: '1020',
    name: 'Bank Accounts',
    type: 'ASSET',
    subType: 'BANK',
    parentCode: '1000',
  },
  {
    code: '1100',
    name: 'Accounts Receivable',
    type: 'ASSET',
    subType: 'RECEIVABLE',
    parentCode: '1000',
  },
  {
    code: '1200',
    name: 'Inventory',
    type: 'ASSET',
    subType: 'INVENTORY',
    parentCode: '1000',
  },
  {
    code: '1300',
    name: 'Prepaid Expenses',
    type: 'ASSET',
    subType: 'PREPAID',
    parentCode: '1000',
  },
  {
    code: '1500',
    name: 'Fixed Assets',
    type: 'ASSET',
    subType: 'FIXED',
    parentCode: '1000',
  },
  {
    code: '1510',
    name: 'Furniture & Equipment',
    type: 'ASSET',
    subType: 'FIXED',
    parentCode: '1500',
  },
  {
    code: '1520',
    name: 'Vehicles',
    type: 'ASSET',
    subType: 'FIXED',
    parentCode: '1500',
  },
  {
    code: '1590',
    name: 'Accumulated Depreciation',
    type: 'ASSET',
    subType: 'CONTRA',
    parentCode: '1500',
  },

  // LIABILITIES (2000 series)
  { code: '2000', name: 'Liabilities', type: 'LIABILITY', subType: 'HEADER' },
  {
    code: '2010',
    name: 'Accounts Payable',
    type: 'LIABILITY',
    subType: 'PAYABLE',
    parentCode: '2000',
  },
  {
    code: '2100',
    name: 'Short-Term Loans',
    type: 'LIABILITY',
    subType: 'LOAN',
    parentCode: '2000',
  },
  {
    code: '2200',
    name: 'GST / Sales Tax Payable',
    type: 'LIABILITY',
    subType: 'TAX',
    parentCode: '2000',
  },
  {
    code: '2300',
    name: 'Withholding Tax Payable',
    type: 'LIABILITY',
    subType: 'TAX',
    parentCode: '2000',
  },
  {
    code: '2500',
    name: 'Long-Term Loans',
    type: 'LIABILITY',
    subType: 'LOAN',
    parentCode: '2000',
  },

  // EQUITY (3000 series)
  { code: '3000', name: 'Equity', type: 'EQUITY', subType: 'HEADER' },
  {
    code: '3010',
    name: "Owner's Capital",
    type: 'EQUITY',
    subType: 'CAPITAL',
    parentCode: '3000',
  },
  {
    code: '3020',
    name: "Owner's Drawings",
    type: 'EQUITY',
    subType: 'DRAWINGS',
    parentCode: '3000',
  },
  {
    code: '3100',
    name: 'Retained Earnings',
    type: 'EQUITY',
    subType: 'RETAINED',
    parentCode: '3000',
  },

  // REVENUE (4000 series)
  { code: '4000', name: 'Revenue', type: 'REVENUE', subType: 'HEADER' },
  {
    code: '4010',
    name: 'Sales Revenue',
    type: 'REVENUE',
    subType: 'SALES',
    parentCode: '4000',
  },
  {
    code: '4020',
    name: 'Service Revenue',
    type: 'REVENUE',
    subType: 'SERVICE',
    parentCode: '4000',
  },
  {
    code: '4100',
    name: 'Other Income',
    type: 'REVENUE',
    subType: 'OTHER',
    parentCode: '4000',
  },
  {
    code: '4110',
    name: 'Interest Income',
    type: 'REVENUE',
    subType: 'INTEREST',
    parentCode: '4100',
  },
  {
    code: '4120',
    name: 'Discount Received',
    type: 'REVENUE',
    subType: 'DISCOUNT',
    parentCode: '4100',
  },

  // EXPENSES (5000 series)
  { code: '5000', name: 'Expenses', type: 'EXPENSE', subType: 'HEADER' },
  {
    code: '5010',
    name: 'Cost of Goods Sold',
    type: 'EXPENSE',
    subType: 'COGS',
    parentCode: '5000',
  },
  {
    code: '5100',
    name: 'Salaries & Wages',
    type: 'EXPENSE',
    subType: 'PAYROLL',
    parentCode: '5000',
  },
  {
    code: '5200',
    name: 'Rent Expense',
    type: 'EXPENSE',
    subType: 'OPERATING',
    parentCode: '5000',
  },
  {
    code: '5300',
    name: 'Utilities',
    type: 'EXPENSE',
    subType: 'OPERATING',
    parentCode: '5000',
  },
  {
    code: '5400',
    name: 'Office Supplies',
    type: 'EXPENSE',
    subType: 'OPERATING',
    parentCode: '5000',
  },
  {
    code: '5500',
    name: 'Transportation',
    type: 'EXPENSE',
    subType: 'OPERATING',
    parentCode: '5000',
  },
  {
    code: '5600',
    name: 'Depreciation Expense',
    type: 'EXPENSE',
    subType: 'DEPRECIATION',
    parentCode: '5000',
  },
  {
    code: '5700',
    name: 'Bank Charges',
    type: 'EXPENSE',
    subType: 'FINANCIAL',
    parentCode: '5000',
  },
  {
    code: '5800',
    name: 'Interest Expense',
    type: 'EXPENSE',
    subType: 'FINANCIAL',
    parentCode: '5000',
  },
  {
    code: '5900',
    name: 'Miscellaneous Expense',
    type: 'EXPENSE',
    subType: 'OTHER',
    parentCode: '5000',
  },
];

@Injectable()
export class AccountingService {
  constructor(private prisma: PrismaService) {}

  // =========================================================
  // 1. CREATE ACCOUNT
  // =========================================================
  async createAccount(createAccountDto: CreateAccountDto) {
    const { companyId, code, name, type, subType, description, parentId } =
      createAccountDto;

    // Validate company exists
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Validate account code is unique within the company
    const existingAccount = await this.prisma.account.findUnique({
      where: { companyId_code: { companyId, code } },
    });
    if (existingAccount) {
      throw new ConflictException(
        `Account with code "${code}" already exists for this company`,
      );
    }

    // Validate parent account if provided
    if (parentId) {
      const parentAccount = await this.prisma.account.findUnique({
        where: { id: parentId },
      });

      if (!parentAccount) {
        throw new NotFoundException(`Parent account not found`);
      }

      if (parentAccount.companyId !== companyId) {
        throw new BadRequestException(
          'Parent account belongs to a different company',
        );
      }

      // Child must inherit the parent's account type
      if (parentAccount.type !== type) {
        throw new BadRequestException(
          `Child account type "${type}" must match parent account type "${parentAccount.type}"`,
        );
      }
    }

    return this.prisma.account.create({
      data: {
        companyId,
        parentId: parentId || null,
        code,
        name,
        type,
        subType: subType || null,
        description: description || null,
      },
      include: {
        parent: { select: { id: true, code: true, name: true } },
      },
    });
  }

  // =========================================================
  // 2. UPDATE ACCOUNT
  // =========================================================
  async updateAccount(
    id: string,
    companyId: string,
    updateAccountDto: UpdateAccountDto,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { children: true, journalLines: { take: 1 } },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.companyId !== companyId) {
      throw new BadRequestException('Account does not belong to this company');
    }

    // Prevent changing the type if the account has journal entries
    if (updateAccountDto.type && updateAccountDto.type !== account.type) {
      if (account.journalLines.length > 0) {
        throw new BadRequestException(
          'Cannot change account type because journal entries exist for this account',
        );
      }
      // Also prevent if it has children (they would become inconsistent)
      if (account.children.length > 0) {
        throw new BadRequestException(
          'Cannot change account type because it has child accounts. Update children first.',
        );
      }
    }

    // Validate new parent if provided
    if (updateAccountDto.parentId) {
      // Prevent circular reference
      if (updateAccountDto.parentId === id) {
        throw new BadRequestException('An account cannot be its own parent');
      }

      const parentAccount = await this.prisma.account.findUnique({
        where: { id: updateAccountDto.parentId },
      });

      if (!parentAccount || parentAccount.companyId !== companyId) {
        throw new BadRequestException('Invalid parent account');
      }

      // Check for circular references deeper in the tree
      const isCircular = await this.checkCircularReference(
        id,
        updateAccountDto.parentId,
      );
      if (isCircular) {
        throw new BadRequestException(
          'Setting this parent would create a circular reference',
        );
      }

      // Type consistency check
      const targetType = updateAccountDto.type || account.type;
      if (parentAccount.type !== targetType) {
        throw new BadRequestException(
          `Account type "${targetType}" must match parent account type "${parentAccount.type}"`,
        );
      }
    }

    return this.prisma.account.update({
      where: { id },
      data: updateAccountDto,
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true } },
      },
    });
  }

  // =========================================================
  // 3. DELETE ACCOUNT (Soft delete via isActive = false)
  // =========================================================
  async deleteAccount(id: string, companyId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { children: true, journalLines: { take: 1 } },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.companyId !== companyId) {
      throw new BadRequestException('Account does not belong to this company');
    }

    // Prevent deletion if account has journal entries (accounting-safe)
    if (account.journalLines.length > 0) {
      throw new BadRequestException(
        'Cannot delete this account because it has journal entries. Deactivate it instead.',
      );
    }

    // Prevent deletion if account has active children
    if (account.children.length > 0) {
      throw new BadRequestException(
        'Cannot delete this account because it has child accounts. Delete or reassign children first.',
      );
    }

    // Hard delete since no journal entries exist
    await this.prisma.account.delete({ where: { id } });
    return {
      message: `Account "${account.code} - ${account.name}" has been deleted`,
    };
  }

  // =========================================================
  // 4. GET SINGLE ACCOUNT WITH DETAILS
  // =========================================================
  async getAccount(id: string, companyId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            balance: true,
            isActive: true,
          },
          orderBy: { code: 'asc' },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.companyId !== companyId) {
      throw new BadRequestException('Account does not belong to this company');
    }

    return account;
  }

  // =========================================================
  // 5. GET FULL CHART OF ACCOUNTS (Flat list, sorted by code)
  // =========================================================
  async getChartOfAccounts(companyId: string) {
    return this.prisma.account.findMany({
      where: { companyId },
      include: {
        parent: { select: { id: true, code: true, name: true } },
        children: {
          select: { id: true, code: true, name: true },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  // =========================================================
  // 6. GET CHART OF ACCOUNTS AS TREE (Hierarchical)
  // =========================================================
  async getChartOfAccountsTree(companyId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId },
      orderBy: { code: 'asc' },
    });

    // Build tree from flat list
    const accountMap = new Map<string, any>();
    const roots: any[] = [];

    // First pass: create map entries
    for (const account of accounts) {
      accountMap.set(account.id, { ...account, children: [] });
    }

    // Second pass: build tree relationships
    for (const account of accounts) {
      const node = accountMap.get(account.id);
      if (account.parentId && accountMap.has(account.parentId)) {
        accountMap.get(account.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // =========================================================
  // 7. GET ACCOUNT BALANCE (Computed from journal lines)
  // =========================================================
  async getAccountBalance(id: string, companyId: string) {
    const account = await this.prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      throw new NotFoundException('Account not found');
    }

    if (account.companyId !== companyId) {
      throw new BadRequestException('Account does not belong to this company');
    }

    // Aggregate debits and credits from posted journal entries only
    const aggregation = await this.prisma.journalLine.aggregate({
      where: {
        accountId: id,
        journalEntry: { status: 'POSTED' },
      },
      _sum: {
        debit: true,
        credit: true,
      },
    });

    const totalDebits = new Decimal(aggregation._sum.debit || 0);
    const totalCredits = new Decimal(aggregation._sum.credit || 0);

    // Normal balance depends on account type:
    // ASSET & EXPENSE: Debit normal (balance = debits - credits)
    // LIABILITY, EQUITY & REVENUE: Credit normal (balance = credits - debits)
    let balance: Decimal;
    if (account.type === 'ASSET' || account.type === 'EXPENSE') {
      balance = totalDebits.minus(totalCredits);
    } else {
      balance = totalCredits.minus(totalDebits);
    }

    return {
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.type,
      totalDebits: totalDebits.toFixed(2),
      totalCredits: totalCredits.toFixed(2),
      balance: balance.toFixed(2),
    };
  }

  // =========================================================
  // 8. SEED DEFAULT CHART OF ACCOUNTS (For new companies)
  // =========================================================
  async seedDefaultAccounts(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    // Check if accounts already exist
    const existingCount = await this.prisma.account.count({
      where: { companyId },
    });
    if (existingCount > 0) {
      throw new ConflictException(
        'This company already has accounts. Seeding is only for new companies.',
      );
    }

    // First pass: create all accounts without parent relationships
    const codeToIdMap = new Map<string, string>();

    for (const acct of DEFAULT_CHART_OF_ACCOUNTS) {
      const created = await this.prisma.account.create({
        data: {
          companyId,
          code: acct.code,
          name: acct.name,
          type: acct.type,
          subType: acct.subType || null,
        },
      });
      codeToIdMap.set(acct.code, created.id);
    }

    // Second pass: set parent relationships
    for (const acct of DEFAULT_CHART_OF_ACCOUNTS) {
      if (acct.parentCode) {
        const childId = codeToIdMap.get(acct.code);
        const parentId = codeToIdMap.get(acct.parentCode);
        if (childId && parentId) {
          await this.prisma.account.update({
            where: { id: childId },
            data: { parentId },
          });
        }
      }
    }

    return {
      message: `Default chart of accounts seeded successfully (${DEFAULT_CHART_OF_ACCOUNTS.length} accounts)`,
      count: DEFAULT_CHART_OF_ACCOUNTS.length,
    };
  }

  // =========================================================
  // PRIVATE HELPERS
  // =========================================================

  /**
   * Walks up the tree from candidateParentId checking if
   * it eventually reaches accountId — which would be circular.
   */
  private async checkCircularReference(
    accountId: string,
    candidateParentId: string,
  ): Promise<boolean> {
    let currentId: string | null = candidateParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === accountId) return true;
      if (visited.has(currentId)) return false; // already visited, no cycle through our target
      visited.add(currentId);

      const parent: { parentId: string | null } | null =
        await this.prisma.account.findUnique({
          where: { id: currentId },
          select: { parentId: true },
        });

      currentId = parent?.parentId ?? null;
    }

    return false;
  }
}
