import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  try {
    const sessions = await prisma.posSession.findMany({
      where: { companyId: 'demo-company-001', status: 'OPEN' },
    });
    console.log("Open Sessions:", sessions);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

check();
