import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';

// =====================================================
// Default Chart of Accounts template for new companies
// =====================================================
const DEFAULT_CHART_OF_ACCOUNTS = [
  // ASSETS (1000 series)
  { code: '1000', name: 'Assets', type: 'ASSET', subType: 'HEADER' },
  { code: '1010', name: 'Cash on Hand', type: 'ASSET', subType: 'CASH', parentCode: '1000' },
  { code: '1020', name: 'Bank Accounts', type: 'ASSET', subType: 'BANK', parentCode: '1000' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE', parentCode: '1000' },
  { code: '1200', name: 'Inventory', type: 'ASSET', subType: 'INVENTORY', parentCode: '1000' },
  { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', subType: 'PREPAID', parentCode: '1000' },
  { code: '1500', name: 'Fixed Assets', type: 'ASSET', subType: 'FIXED', parentCode: '1000' },
  { code: '1510', name: 'Furniture & Equipment', type: 'ASSET', subType: 'FIXED', parentCode: '1500' },
  { code: '1520', name: 'Vehicles', type: 'ASSET', subType: 'FIXED', parentCode: '1500' },
  { code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', subType: 'CONTRA', parentCode: '1500' },

  // LIABILITIES (2000 series)
  { code: '2000', name: 'Liabilities', type: 'LIABILITY', subType: 'HEADER' },
  { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', subType: 'PAYABLE', parentCode: '2000' },
  { code: '2100', name: 'Short-Term Loans', type: 'LIABILITY', subType: 'LOAN', parentCode: '2000' },
  { code: '2200', name: 'GST / Sales Tax Payable', type: 'LIABILITY', subType: 'TAX', parentCode: '2000' },
  { code: '2300', name: 'Withholding Tax Payable', type: 'LIABILITY', subType: 'TAX', parentCode: '2000' },
  { code: '2500', name: 'Long-Term Loans', type: 'LIABILITY', subType: 'LOAN', parentCode: '2000' },

  // EQUITY (3000 series)
  { code: '3000', name: 'Equity', type: 'EQUITY', subType: 'HEADER' },
  { code: '3010', name: "Owner's Capital", type: 'EQUITY', subType: 'CAPITAL', parentCode: '3000' },
  { code: '3020', name: "Owner's Drawings", type: 'EQUITY', subType: 'DRAWINGS', parentCode: '3000' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subType: 'RETAINED', parentCode: '3000' },

  // REVENUE (4000 series)
  { code: '4000', name: 'Revenue', type: 'REVENUE', subType: 'HEADER' },
  { code: '4010', name: 'Sales Revenue', type: 'REVENUE', subType: 'SALES', parentCode: '4000' },
  { code: '4020', name: 'Service Revenue', type: 'REVENUE', subType: 'SERVICE', parentCode: '4000' },
  { code: '4100', name: 'Other Income', type: 'REVENUE', subType: 'OTHER', parentCode: '4000' },
  { code: '4110', name: 'Interest Income', type: 'REVENUE', subType: 'INTEREST', parentCode: '4100' },
  { code: '4120', name: 'Discount Received', type: 'REVENUE', subType: 'DISCOUNT', parentCode: '4100' },

  // EXPENSES (5000 series)
  { code: '5000', name: 'Expenses', type: 'EXPENSE', subType: 'HEADER' },
  { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', subType: 'COGS', parentCode: '5000' },
  { code: '5100', name: 'Salaries & Wages', type: 'EXPENSE', subType: 'PAYROLL', parentCode: '5000' },
  { code: '5200', name: 'Rent Expense', type: 'EXPENSE', subType: 'OPERATING', parentCode: '5000' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE', subType: 'OPERATING', parentCode: '5000' },
  { code: '5400', name: 'Office Supplies', type: 'EXPENSE', subType: 'OPERATING', parentCode: '5000' },
  { code: '5500', name: 'Transportation', type: 'EXPENSE', subType: 'OPERATING', parentCode: '5000' },
  { code: '5600', name: 'Depreciation Expense', type: 'EXPENSE', subType: 'DEPRECIATION', parentCode: '5000' },
  { code: '5700', name: 'Bank Charges', type: 'EXPENSE', subType: 'FINANCIAL', parentCode: '5000' },
  { code: '5800', name: 'Interest Expense', type: 'EXPENSE', subType: 'FINANCIAL', parentCode: '5000' },
  { code: '5900', name: 'Miscellaneous Expense', type: 'EXPENSE', subType: 'OTHER', parentCode: '5000' },
];

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(createCompanyDto: CreateCompanyDto) {
    const { userId, name, email, phone, address, currency } = createCompanyDto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the company
      const company = await tx.company.create({
        data: { name, email, phone, address, currency: currency || 'PKR' },
      });

      // 2. Create default roles for this company
      const adminRole = await tx.role.create({
        data: {
          companyId: company.id,
          name: 'ADMIN',
          description: 'Administrator with full system privileges',
          permissions: '*',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'ACCOUNTANT',
          description: 'Accountant with financial entry and reports access',
          permissions:
            'accounts:*,journal:*,reports:*,customers:*,vendors:*,invoices:*',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'MANAGER',
          description: 'Manager with dashboard and financial view privileges',
          permissions:
            'dashboard:*,reports:*,customers:read,vendors:read,invoices:read',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'CASHIER',
          description:
            'Cashier with sales invoicing and customer management access',
          permissions:
            'invoices:create,invoices:read,customers:create,customers:read',
        },
      });

      // 3. Link user as ADMIN of the company using the new Role relation
      await tx.userCompany.create({
        data: {
          userId,
          companyId: company.id,
          roleId: adminRole.id,
        },
      });

      // 4. Seed default Chart of Accounts
      const codeToIdMap = new Map<string, string>();

      // First pass: create all accounts without parent relationships
      for (const acct of DEFAULT_CHART_OF_ACCOUNTS) {
        const created = await tx.account.create({
          data: {
            companyId: company.id,
            code: acct.code,
            name: acct.name,
            type: acct.type as any,
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
            await tx.account.update({
              where: { id: childId },
              data: { parentId },
            });
          }
        }
      }

      return company;
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.company.findMany({
      where: {
        users: {
          some: { userId },
        },
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: { select: { id: true, firstName: true, email: true } },
            role: true,
          },
        },
      },
    });
  }
}
