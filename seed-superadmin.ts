import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedSuperAdmin() {
  const email = 'latifqadri758@gmail.com';
  const password = 'SuperAdmin@2024'; // You can change this

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Update to make super admin if already exists
    await prisma.user.update({
      where: { email },
      data: { isSuperAdmin: true },
    });
    console.log(`✅ User ${email} updated to Super Admin`);
  } else {
    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email,
        password: hashed,
        firstName: 'Latif',
        lastName: 'Qadri',
        isSuperAdmin: true,
        isActive: true,
      },
    });
    console.log(`✅ Super Admin created: ${email}`);
    console.log(`🔑 Password: ${password}`);
  }

  await prisma.$disconnect();
}

seedSuperAdmin().catch(console.error);
