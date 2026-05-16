import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteCompanyForUser() {
  const email = 'latifqadri758@gmail.com';

  const user = await prisma.user.findUnique({
    where: { email },
    include: { companies: { include: { company: true } } }
  });

  if (!user || user.companies.length === 0) {
    console.log('No companies to delete');
    await prisma.$disconnect();
    return;
  }

  for (const uc of user.companies) {
    const companyId = uc.company.id;
    console.log(`Deleting: ${uc.company.name} (${companyId})`);

    // Delete in order to avoid FK violations
    await prisma.$executeRawUnsafe(`DELETE FROM "JournalLine" WHERE "journalEntryId" IN (SELECT id FROM "JournalEntry" WHERE "companyId" = '${companyId}')`);
    await prisma.$executeRawUnsafe(`DELETE FROM "JournalEntry" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "InvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "companyId" = '${companyId}')`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Payment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "companyId" = '${companyId}')`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "StockTransaction" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "WarehouseStock" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "PosHeldCart" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "PosSession" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Product" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Account" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Customer" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Warehouse" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "UserCompany" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Role" WHERE "companyId" = '${companyId}'`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Company" WHERE "id" = '${companyId}'`);

    console.log(`✅ Deleted: ${uc.company.name}`);
  }

  await prisma.$disconnect();
}

deleteCompanyForUser().catch(console.error);
