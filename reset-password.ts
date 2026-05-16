import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function resetSuperAdminPassword() {
  const email = 'latifqadri758@gmail.com';
  const newPassword = 'Karobar@SuperAdmin2024';
  
  const hashed = await bcrypt.hash(newPassword, 12);
  
  await prisma.user.update({
    where: { email },
    data: { 
      password: hashed,
      isSuperAdmin: true,  // ensure this is set
    }
  });
  
  console.log(`✅ Password reset for: ${email}`);
  console.log(`🔑 New Password: ${newPassword}`);
  
  // Verify
  const user = await prisma.user.findUnique({ where: { email } });
  console.log(`✅ isSuperAdmin: ${user?.isSuperAdmin}`);
  
  await prisma.$disconnect();
}

resetSuperAdminPassword().catch(console.error);
