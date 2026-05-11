const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      }
    });
    console.log("REGISTERED USERS IN DATABASE:", JSON.stringify(users, null, 2));
  } catch (error) {
    console.error("ERROR QUERYING DATABASE:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
