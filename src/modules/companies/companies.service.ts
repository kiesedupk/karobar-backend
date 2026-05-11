import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';

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
          permissions: 'accounts:*,journal:*,reports:*,customers:*,vendors:*,invoices:*',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'MANAGER',
          description: 'Manager with dashboard and financial view privileges',
          permissions: 'dashboard:*,reports:*,customers:read,vendors:read,invoices:read',
        },
      });

      await tx.role.create({
        data: {
          companyId: company.id,
          name: 'CASHIER',
          description: 'Cashier with sales invoicing and customer management access',
          permissions: 'invoices:create,invoices:read,customers:create,customers:read',
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
