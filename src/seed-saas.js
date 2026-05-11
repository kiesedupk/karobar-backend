const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function main() {
  const prisma = new PrismaClient();
  
  const email = 'admin@example.com';
  const passwordText = 'admin123';
  const hashedPassword = await bcrypt.hash(passwordText, 10);

  console.log('Starting SaaS Database Seeding...');

  try {
    // 1. Create Admin User
    console.log(`Creating Admin User: ${email}`);
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Administrator',
        isActive: true,
      },
    });

    console.log(`Admin User created: ID = ${user.id}`);

    // 2. Create Company
    console.log('Creating initial company: Karobar Corp');
    const company = await prisma.company.create({
      data: {
        name: 'Karobar Corp',
        email: 'info@karobarcorp.com',
        phone: '+92 300 1234567',
        address: '123 Business Avenue, Shahrah-e-Faisal, Karachi, Pakistan',
        currency: 'PKR',
      },
    });

    console.log(`Company created: ID = ${company.id}`);

    // 3. Create Default Roles for Company
    console.log('Creating company roles (ADMIN, ACCOUNTANT, MANAGER, CASHIER)...');
    const adminRole = await prisma.role.create({
      data: {
        companyId: company.id,
        name: 'ADMIN',
        description: 'Administrator with full system privileges',
        permissions: '*',
      },
    });

    await prisma.role.create({
      data: {
        companyId: company.id,
        name: 'ACCOUNTANT',
        description: 'Accountant with financial entry and reports access',
        permissions: 'accounts:*,journal:*,reports:*,customers:*,vendors:*,invoices:*',
      },
    });

    // Link user as ADMIN of the company
    await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        roleId: adminRole.id,
      },
    });

    console.log('User linked to Company with ADMIN role.');

    // 4. Seed Chart of Accounts
    console.log('Seeding Chart of Accounts...');
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
      
      // LIABILITIES (2000 series)
      { code: '2000', name: 'Liabilities', type: 'LIABILITY', subType: 'HEADER' },
      { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', subType: 'PAYABLE', parentCode: '2000' },
      { code: '2200', name: 'GST / Sales Tax Payable', type: 'LIABILITY', subType: 'TAX', parentCode: '2000' },
      
      // EQUITY (3000 series)
      { code: '3000', name: 'Equity', type: 'EQUITY', subType: 'HEADER' },
      { code: '3010', name: "Owner's Capital", type: 'EQUITY', subType: 'CAPITAL', parentCode: '3000' },
      { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subType: 'RETAINED', parentCode: '3000' },
      
      // REVENUE (4000 series)
      { code: '4000', name: 'Revenue', type: 'REVENUE', subType: 'HEADER' },
      { code: '4010', name: 'Sales Revenue', type: 'REVENUE', subType: 'SALES', parentCode: '4000' },
      { code: '4100', name: 'Other Income', type: 'REVENUE', subType: 'OTHER', parentCode: '4000' },
      
      // EXPENSES (5000 series)
      { code: '5000', name: 'Expenses', type: 'EXPENSE', subType: 'HEADER' },
      { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', subType: 'COGS', parentCode: '5000' },
      { code: '5100', name: 'Salaries & Wages', type: 'EXPENSE', subType: 'PAYROLL', parentCode: '5000' },
      { code: '5200', name: 'Rent Expense', type: 'EXPENSE', subType: 'OPERATING', parentCode: '5000' },
    ];

    // Keep track of created accounts code -> id
    const codeToId = {};

    // First seed headers
    for (const item of DEFAULT_CHART_OF_ACCOUNTS.filter(a => a.subType === 'HEADER')) {
      const acc = await prisma.account.create({
        data: {
          companyId: company.id,
          code: item.code,
          name: item.name,
          type: item.type,
          subType: item.subType,
          balance: 0.00,
        }
      });
      codeToId[item.code] = acc.id;
    }

    // Then seed child accounts
    for (const item of DEFAULT_CHART_OF_ACCOUNTS.filter(a => a.subType !== 'HEADER')) {
      const parentId = item.parentCode ? codeToId[item.parentCode] : null;
      const acc = await prisma.account.create({
        data: {
          companyId: company.id,
          code: item.code,
          name: item.name,
          type: item.type,
          subType: item.subType,
          parentId,
          balance: 0.00,
        }
      });
      codeToId[item.code] = acc.id;
    }

    console.log('Chart of Accounts successfully seeded!');

    // 5. Create default Customer & Vendor
    console.log('Seeding Master Data (Customers & Vendors)...');
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: 'Kanz-ul-Iman Education System',
        email: 'info@kies.edu.pk',
        phone: '+92 321 9876543',
        address: 'Karachi, Pakistan',
        balance: 0.00,
      }
    });

    const vendor = await prisma.vendor.create({
      data: {
        companyId: company.id,
        name: 'National Publishing House',
        email: 'sales@nph.com',
        phone: '+92 213 4567890',
        address: 'Urdu Bazar, Karachi, Pakistan',
        balance: 0.00,
      }
    });

    console.log(`Master Data Seeded: Customer ID = ${customer.id}, Vendor ID = ${vendor.id}`);
    console.log('\n=========================================');
    console.log('SEEDING COMPLETED SUCCESSFULLY!');
    console.log(`LOGIN EMAIL   : ${email}`);
    console.log(`LOGIN PASSWORD: ${passwordText}`);
    console.log('=========================================');

  } catch (error) {
    console.error('SEEDING ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
