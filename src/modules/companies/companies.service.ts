import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AddUserDto } from './dto/add-user.dto';
import * as bcrypt from 'bcryptjs';

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

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    // Verify company exists
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.company.update({
      where: { id },
      data: updateCompanyDto,
    });
  }

  async getRoles(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId },
    });
  }

  async addUser(companyId: string, addUserDto: AddUserDto) {
    const { firstName, lastName, email, password, roleId } = addUserDto;

    // Check if role exists and belongs to this company
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
    });
    if (!role || role.companyId !== companyId) {
      throw new NotFoundException('Invalid role selected');
    }

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          email,
          password: hashedPassword,
        },
      });
    }

    // Check if already in company
    const existingLink = await this.prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: user.id,
          companyId,
        },
      },
    });

    if (existingLink) {
      // Just update their role
      return this.prisma.userCompany.update({
        where: { id: existingLink.id },
        data: { roleId },
        include: { user: true, role: true },
      });
    }

    // Link user to company
    return this.prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId,
        roleId,
      },
      include: { user: true, role: true },
    });
  }
}
