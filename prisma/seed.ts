// =====================================================
// Karobar Accounting SaaS — Seed Script
// Creates a complete demo environment with realistic
// Pakistani business data for testing & demos.
// =====================================================

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Karobar Accounting SaaS...\n');

  // ==========================================
  // 1. DEMO COMPANY
  // ==========================================
  const company = await prisma.company.upsert({
    where: { id: 'demo-company-001' },
    update: {},
    create: {
      id: 'demo-company-001',
      name: 'Al-Noor Trading Co.',
      email: 'info@alnoortradingco.pk',
      phone: '+92-321-1234567',
      address: 'Plot 14-B, Korangi Industrial Area, Karachi',
      currency: 'PKR',
    },
  });
  console.log(`✅ Company: ${company.name}`);

  // ==========================================
  // 2. ROLES
  // ==========================================
  const adminRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'ADMIN' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'ADMIN',
      description: 'Full system access',
      permissions: '*',
    },
  });

  const accountantRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'ACCOUNTANT' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'ACCOUNTANT',
      description: 'Financial data access',
      permissions: 'invoice:*,journal:*,report:*,expense:*,account:*',
    },
  });

  const managerRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'MANAGER' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'MANAGER',
      description: 'Read-only oversight',
      permissions: 'invoice:read,journal:read,report:read,expense:read,account:read',
    },
  });

  const cashierRole = await prisma.role.upsert({
    where: { companyId_name: { companyId: company.id, name: 'CASHIER' } },
    update: {},
    create: {
      companyId: company.id,
      name: 'CASHIER',
      description: 'Day-to-day transaction processing',
      permissions: 'invoice:create,invoice:read,expense:create,expense:read,journal:read',
    },
  });
  console.log('✅ Roles: ADMIN, ACCOUNTANT, MANAGER, CASHIER');

  // ==========================================
  // 3. DEMO USERS
  // ==========================================
  const passwordHash = await bcrypt.hash('Demo@123', 10);

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@karobar.pk' },
    update: {},
    create: {
      email: 'admin@karobar.pk',
      password: passwordHash,
      firstName: 'Ahmed',
      lastName: 'Khan',
    },
  });

  const accountantUser = await prisma.user.upsert({
    where: { email: 'accountant@karobar.pk' },
    update: {},
    create: {
      email: 'accountant@karobar.pk',
      password: passwordHash,
      firstName: 'Bilal',
      lastName: 'Shah',
    },
  });

  const managerUser = await prisma.user.upsert({
    where: { email: 'manager@karobar.pk' },
    update: {},
    create: {
      email: 'manager@karobar.pk',
      password: passwordHash,
      firstName: 'Tariq',
      lastName: 'Mehmood',
    },
  });

  const cashierUser = await prisma.user.upsert({
    where: { email: 'cashier@karobar.pk' },
    update: {},
    create: {
      email: 'cashier@karobar.pk',
      password: passwordHash,
      firstName: 'Usman',
      lastName: 'Ali',
    },
  });

  // Link users to company
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: adminUser.id, companyId: company.id } },
    update: {},
    create: { userId: adminUser.id, companyId: company.id, roleId: adminRole.id },
  });
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: accountantUser.id, companyId: company.id } },
    update: {},
    create: { userId: accountantUser.id, companyId: company.id, roleId: accountantRole.id },
  });
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: managerUser.id, companyId: company.id } },
    update: {},
    create: { userId: managerUser.id, companyId: company.id, roleId: managerRole.id },
  });
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: cashierUser.id, companyId: company.id } },
    update: {},
    create: { userId: cashierUser.id, companyId: company.id, roleId: cashierRole.id },
  });
  console.log('✅ Users: admin, accountant, manager, cashier (password: Demo@123)');

  // ==========================================
  // 4. CHART OF ACCOUNTS (Pakistani Standard)
  // ==========================================
  const accountsData = [
    // ASSETS (1xxx)
    { code: '1000', name: 'Assets', type: 'ASSET', subType: 'HEADER' },
    { code: '1010', name: 'Cash in Hand', type: 'ASSET', subType: 'CASH' },
    { code: '1020', name: 'Bank Account — HBL', type: 'ASSET', subType: 'BANK' },
    { code: '1030', name: 'Bank Account — Meezan', type: 'ASSET', subType: 'BANK' },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE' },
    { code: '1200', name: 'Inventory', type: 'ASSET', subType: 'INVENTORY' },
    { code: '1300', name: 'Advance Tax (Withholding)', type: 'ASSET', subType: 'PREPAID' },
    { code: '1500', name: 'Office Equipment', type: 'ASSET', subType: 'FIXED' },
    { code: '1510', name: 'Furniture & Fixtures', type: 'ASSET', subType: 'FIXED' },
    { code: '1520', name: 'Vehicles', type: 'ASSET', subType: 'FIXED' },
    { code: '1590', name: 'Accumulated Depreciation', type: 'ASSET', subType: 'CONTRA' },

    // LIABILITIES (2xxx)
    { code: '2000', name: 'Liabilities', type: 'LIABILITY', subType: 'HEADER' },
    { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', subType: 'PAYABLE' },
    { code: '2100', name: 'Accrued Expenses', type: 'LIABILITY', subType: 'ACCRUED' },
    { code: '2200', name: 'Sales Tax Payable (GST)', type: 'LIABILITY', subType: 'TAX' },
    { code: '2300', name: 'Income Tax Payable', type: 'LIABILITY', subType: 'TAX' },
    { code: '2500', name: 'Bank Loan — HBL', type: 'LIABILITY', subType: 'LOAN' },

    // EQUITY (3xxx)
    { code: '3000', name: 'Equity', type: 'EQUITY', subType: 'HEADER' },
    { code: '3010', name: 'Owner Capital — Ahmed Khan', type: 'EQUITY', subType: 'CAPITAL' },
    { code: '3020', name: 'Owner Drawings', type: 'EQUITY', subType: 'DRAWINGS' },
    { code: '3100', name: 'Retained Earnings', type: 'EQUITY', subType: 'RETAINED' },

    // REVENUE (4xxx)
    { code: '4000', name: 'Revenue', type: 'REVENUE', subType: 'HEADER' },
    { code: '4010', name: 'Sales Revenue', type: 'REVENUE', subType: 'SALES' },
    { code: '4020', name: 'Service Revenue', type: 'REVENUE', subType: 'SALES' },
    { code: '4500', name: 'Other Income', type: 'REVENUE', subType: 'OTHER' },

    // EXPENSES (5xxx)
    { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE', subType: 'COGS' },
    { code: '5100', name: 'Salaries & Wages', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5110', name: 'Rent Expense', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5120', name: 'Utilities (Electricity/Gas)', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5130', name: 'Internet & Phone', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5140', name: 'Office Supplies', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5150', name: 'Transportation', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5160', name: 'Marketing & Advertising', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5170', name: 'Professional Fees', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5200', name: 'Depreciation Expense', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5300', name: 'Bank Charges', type: 'EXPENSE', subType: 'OPERATING' },
    { code: '5400', name: 'Miscellaneous Expense', type: 'EXPENSE', subType: 'OPERATING' },
  ];

  for (const acc of accountsData) {
    await prisma.account.upsert({
      where: { companyId_code: { companyId: company.id, code: acc.code } },
      update: {},
      create: { companyId: company.id, ...acc },
    });
  }
  console.log(`✅ Chart of Accounts: ${accountsData.length} accounts seeded`);

  // ==========================================
  // 5. DEMO CUSTOMERS
  // ==========================================
  const customersData = [
    { name: 'Karachi Electronics', email: 'orders@khi-electronics.pk', phone: '+92-300-1111111', address: 'Shop 22, Saddar, Karachi' },
    { name: 'Lahore Textiles Pvt Ltd', email: 'procurement@lahoretextiles.pk', phone: '+92-321-2222222', address: '45-B, Gulberg III, Lahore' },
    { name: 'Islamabad Tech Solutions', email: 'billing@isb-tech.pk', phone: '+92-333-3333333', address: 'F-7 Markaz, Islamabad' },
    { name: 'Peshawar General Store', email: 'info@peshgstore.pk', phone: '+92-345-4444444', address: 'University Road, Peshawar' },
    { name: 'Quetta Wholesale Mart', email: 'sales@quettamart.pk', phone: '+92-312-5555555', address: 'Jinnah Road, Quetta' },
  ];

  const customers: any[] = [];
  for (const c of customersData) {
    const cust = await prisma.customer.create({
      data: { companyId: company.id, ...c },
    });
    customers.push(cust);
  }
  console.log(`✅ Customers: ${customers.length} demo customers`);

  // ==========================================
  // 6. DEMO VENDORS
  // ==========================================
  const vendorsData = [
    { name: 'National Supplies Co.', email: 'orders@natsupplies.pk', phone: '+92-300-9999111', address: 'SITE Area, Karachi' },
    { name: 'K-Electric', email: 'billing@ke.com.pk', phone: '118', address: 'Karachi' },
    { name: 'PTCL', email: 'corporate@ptcl.net.pk', phone: '1218', address: 'Islamabad' },
    { name: 'Office World', email: 'sales@officeworld.pk', phone: '+92-321-8888111', address: 'Tariq Road, Karachi' },
  ];

  const vendors: any[] = [];
  for (const v of vendorsData) {
    const vendor = await prisma.vendor.create({
      data: { companyId: company.id, ...v },
    });
    vendors.push(vendor);
  }
  console.log(`✅ Vendors: ${vendors.length} demo vendors`);

  // ==========================================
  // 7. OPENING BALANCE JOURNAL ENTRY
  // ==========================================
  // Get account IDs
  const getAccId = async (code: string) => {
    const acc = await prisma.account.findUnique({
      where: { companyId_code: { companyId: company.id, code } },
    });
    return acc!.id;
  };

  const cashId = await getAccId('1010');
  const bankHblId = await getAccId('1020');
  const bankMeezanId = await getAccId('1030');
  const receivableId = await getAccId('1100');
  const inventoryId = await getAccId('1200');
  const equipmentId = await getAccId('1500');
  const furnitureId = await getAccId('1510');
  const payableId = await getAccId('2010');
  const capitalId = await getAccId('3010');
  const salesRevId = await getAccId('4010');
  const cogsId = await getAccId('5000');
  const salariesId = await getAccId('5100');
  const rentId = await getAccId('5110');
  const utilitiesId = await getAccId('5120');
  const internetId = await getAccId('5130');
  const suppliesId = await getAccId('5140');
  const transportId = await getAccId('5150');
  const bankChargesId = await getAccId('5300');
  const gstPayableId = await getAccId('2200');

  // Opening balance entry
  const existingOB = await prisma.journalEntry.findFirst({
    where: { companyId: company.id, reference: 'OB-2026' },
  });
  if (!existingOB) {
    await prisma.journalEntry.create({
      data: {
        companyId: company.id,
        date: new Date('2026-01-01'),
        reference: 'OB-2026',
        description: 'Opening Balances — FY 2026',
        status: 'POSTED',
        lines: {
          create: [
            { accountId: cashId, description: 'Opening cash', debit: 250000, credit: 0 },
            { accountId: bankHblId, description: 'Opening HBL balance', debit: 1500000, credit: 0 },
            { accountId: bankMeezanId, description: 'Opening Meezan balance', debit: 800000, credit: 0 },
            { accountId: inventoryId, description: 'Opening inventory', debit: 2000000, credit: 0 },
            { accountId: equipmentId, description: 'Office equipment', debit: 350000, credit: 0 },
            { accountId: furnitureId, description: 'Furniture', debit: 200000, credit: 0 },
            { accountId: capitalId, description: 'Owner capital investment', debit: 0, credit: 5100000 },
          ],
        },
      },
    });
  }
  console.log('✅ Opening Balance entry posted');

  // ==========================================
  // 8. DEMO JOURNAL ENTRIES (Monthly activity)
  // ==========================================
  const journalData = [
    {
      date: '2026-01-15', ref: 'JE-2026-001', desc: 'Rent payment — January 2026',
      lines: [
        { accountId: rentId, desc: 'Office rent Jan', debit: 85000, credit: 0 },
        { accountId: bankHblId, desc: 'Paid via HBL', debit: 0, credit: 85000 },
      ],
    },
    {
      date: '2026-01-25', ref: 'JE-2026-002', desc: 'Salary disbursement — January 2026',
      lines: [
        { accountId: salariesId, desc: 'Staff salaries', debit: 320000, credit: 0 },
        { accountId: bankHblId, desc: 'Salary transfer', debit: 0, credit: 320000 },
      ],
    },
    {
      date: '2026-02-05', ref: 'JE-2026-003', desc: 'K-Electric bill — January',
      lines: [
        { accountId: utilitiesId, desc: 'Electricity bill', debit: 45000, credit: 0 },
        { accountId: cashId, desc: 'Paid cash', debit: 0, credit: 45000 },
      ],
    },
    {
      date: '2026-02-10', ref: 'JE-2026-004', desc: 'PTCL Internet — February',
      lines: [
        { accountId: internetId, desc: 'Internet charges', debit: 8500, credit: 0 },
        { accountId: bankMeezanId, desc: 'Auto-debit', debit: 0, credit: 8500 },
      ],
    },
    {
      date: '2026-02-15', ref: 'JE-2026-005', desc: 'Rent payment — February 2026',
      lines: [
        { accountId: rentId, desc: 'Office rent Feb', debit: 85000, credit: 0 },
        { accountId: bankHblId, desc: 'Paid via HBL', debit: 0, credit: 85000 },
      ],
    },
    {
      date: '2026-03-01', ref: 'JE-2026-006', desc: 'Office supplies purchased',
      lines: [
        { accountId: suppliesId, desc: 'Stationery & supplies', debit: 12000, credit: 0 },
        { accountId: cashId, desc: 'Paid cash', debit: 0, credit: 12000 },
      ],
    },
    {
      date: '2026-03-10', ref: 'JE-2026-007', desc: 'Bank service charges — Q1',
      lines: [
        { accountId: bankChargesId, desc: 'HBL quarterly charges', debit: 2500, credit: 0 },
        { accountId: bankHblId, desc: 'Debited by bank', debit: 0, credit: 2500 },
      ],
    },
    {
      date: '2026-03-15', ref: 'JE-2026-008', desc: 'Goods purchased for resale',
      lines: [
        { accountId: cogsId, desc: 'Inventory purchase', debit: 500000, credit: 0 },
        { accountId: payableId, desc: 'Credit — National Supplies', debit: 0, credit: 500000 },
      ],
    },
    {
      date: '2026-04-01', ref: 'JE-2026-009', desc: 'Delivery expense — March shipments',
      lines: [
        { accountId: transportId, desc: 'Courier & freight', debit: 18000, credit: 0 },
        { accountId: cashId, desc: 'Paid cash', debit: 0, credit: 18000 },
      ],
    },
  ];

  for (const je of journalData) {
    const existing = await prisma.journalEntry.findFirst({
      where: { companyId: company.id, reference: je.ref },
    });
    if (!existing) {
      await prisma.journalEntry.create({
        data: {
          companyId: company.id,
          date: new Date(je.date),
          reference: je.ref,
          description: je.desc,
          status: 'POSTED',
          lines: {
            create: je.lines.map(l => ({
              accountId: l.accountId,
              description: l.desc,
              debit: l.debit,
              credit: l.credit,
            })),
          },
        },
      });
    }
  }
  console.log(`✅ Journal Entries: ${journalData.length + 1} entries (skipped duplicates)`);

  // ==========================================
  // 9. DEMO INVOICES (with auto journal)
  // ==========================================
  const invoicesData = [
    {
      customer: customers[0], number: 'INV-2026-001', date: '2026-01-20',
      dueDate: '2026-02-19', status: 'PAID',
      items: [
        { description: 'LED Panel 50W (x20)', quantity: 20, unitPrice: 4500, taxRate: 17 },
        { description: 'Cable Roll 100m', quantity: 5, unitPrice: 3200, taxRate: 17 },
      ],
    },
    {
      customer: customers[1], number: 'INV-2026-002', date: '2026-02-05',
      dueDate: '2026-03-07', status: 'SENT',
      items: [
        { description: 'Cotton Fabric 500 yards', quantity: 500, unitPrice: 350, taxRate: 17 },
      ],
    },
    {
      customer: customers[2], number: 'INV-2026-003', date: '2026-03-01',
      dueDate: '2026-03-31', status: 'SENT',
      items: [
        { description: 'IT Consulting — March', quantity: 40, unitPrice: 5000, taxRate: 17 },
        { description: 'Network Setup', quantity: 1, unitPrice: 75000, taxRate: 17 },
      ],
    },
    {
      customer: customers[3], number: 'INV-2026-004', date: '2026-03-20',
      dueDate: '2026-04-19', status: 'DRAFT',
      items: [
        { description: 'General Merchandise Lot', quantity: 1, unitPrice: 120000, taxRate: 17 },
      ],
    },
    {
      customer: customers[0], number: 'INV-2026-005', date: '2026-04-10',
      dueDate: '2026-05-10', status: 'OVERDUE',
      items: [
        { description: 'Solar Panel 100W', quantity: 10, unitPrice: 15000, taxRate: 17 },
        { description: 'Inverter 3KW', quantity: 2, unitPrice: 45000, taxRate: 17 },
      ],
    },
  ];

  for (const inv of invoicesData) {
    // Skip if invoice already exists
    const existingInv = await prisma.invoice.findFirst({
      where: { companyId: company.id, invoiceNumber: inv.number },
    });
    if (existingInv) continue;

    let subTotal = 0;
    let totalTax = 0;
    const calcItems = inv.items.map(item => {
      const lineSub = item.quantity * item.unitPrice;
      const tax = lineSub * item.taxRate / 100;
      subTotal += lineSub;
      totalTax += tax;
      return {
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        taxAmount: tax,
        discountRate: 0,
        discountAmount: 0,
        totalAmount: lineSub + tax,
      };
    });
    const totalAmount = subTotal + totalTax;

    // Create journal entry for non-draft invoices
    let journalEntryId: string | null = null;
    if (inv.status !== 'DRAFT') {
      const existingJE = await prisma.journalEntry.findFirst({
        where: { companyId: company.id, reference: `INV-${inv.number}` },
      });
      if (!existingJE) {
        const je = await prisma.journalEntry.create({
          data: {
            companyId: company.id,
            date: new Date(inv.date),
            reference: `INV-${inv.number}`,
            description: `Sales Invoice ${inv.number} — ${inv.customer.name}`,
            status: 'POSTED',
            lines: {
              create: [
                { accountId: receivableId, description: `Invoice ${inv.number}`, debit: totalAmount, credit: 0 },
                { accountId: salesRevId, description: `Revenue ${inv.number}`, debit: 0, credit: subTotal },
                { accountId: gstPayableId, description: `GST ${inv.number}`, debit: 0, credit: totalTax },
              ],
            },
          },
        });
        journalEntryId = je.id;
      }
    }

    await prisma.invoice.create({
      data: {
        companyId: company.id,
        customerId: inv.customer.id,
        invoiceNumber: inv.number,
        issueDate: new Date(inv.date),
        dueDate: new Date(inv.dueDate),
        subTotal,
        discountAmount: 0,
        taxAmount: totalTax,
        totalAmount,
        paidAmount: inv.status === 'PAID' ? totalAmount : 0,
        status: inv.status,
        journalEntryId,
        items: { create: calcItems },
      },
    });
  }
  console.log(`✅ Invoices: ${invoicesData.length} demo invoices (skipped duplicates)`);

  // ==========================================
  // 10. UPDATE ACCOUNT BALANCES (from all posted entries)
  // ==========================================
  const allAccounts = await prisma.account.findMany({ where: { companyId: company.id } });
  for (const account of allAccounts) {
    const agg = await prisma.journalLine.aggregate({
      where: {
        accountId: account.id,
        journalEntry: { status: 'POSTED' },
      },
      _sum: { debit: true, credit: true },
    });
    const totalDebit = Number(agg._sum.debit || 0);
    const totalCredit = Number(agg._sum.credit || 0);

    let balance: number;
    if (account.type === 'ASSET' || account.type === 'EXPENSE') {
      balance = totalDebit - totalCredit;
    } else {
      balance = totalCredit - totalDebit;
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { balance },
    });
  }
  console.log('✅ Account balances recalculated');

  // ==========================================
  // SUMMARY
  // ==========================================
  console.log('\n========================================');
  console.log('🎉 Seed completed successfully!');
  console.log('========================================');
  console.log(`Company:   ${company.name}`);
  console.log(`Admin:     admin@karobar.pk / Demo@123`);
  console.log(`Accountant: accountant@karobar.pk / Demo@123`);
  console.log(`Manager:   manager@karobar.pk / Demo@123`);
  console.log(`Cashier:   cashier@karobar.pk / Demo@123`);
  console.log(`Accounts:  ${accountsData.length}`);
  console.log(`Customers: ${customers.length}`);
  console.log(`Vendors:   ${vendors.length}`);
  console.log(`Invoices:  ${invoicesData.length}`);
  console.log(`Journal Entries: ${journalData.length + 1 + invoicesData.filter(i => i.status !== 'DRAFT').length}`);
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
