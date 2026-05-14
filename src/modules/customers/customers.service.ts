import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCustomerDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.customer.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        email: dto.email || null,
        phone: dto.phone || null,
        address: dto.address || null,
      },
    });
  }

  async findAll(companyId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * Math.min(limit, 100);
    const where: any = { companyId };
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [customers, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        include: { _count: { select: { invoices: true } } },
        orderBy: { name: 'asc' },
        skip,
        take: Math.min(limit, 100),
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / Math.min(limit, 100)),
      },
    };
  }

  async findOne(id: string, companyId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            paidAmount: true,
            status: true,
            issueDate: true,
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId)
      throw new BadRequestException('Customer does not belong to this company');

    return customer;
  }

  async update(id: string, companyId: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId)
      throw new BadRequestException('Customer does not belong to this company');

    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { invoices: { take: 1 } },
    });

    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId)
      throw new BadRequestException('Customer does not belong to this company');

    if (customer.invoices.length > 0) {
      throw new BadRequestException(
        'Cannot delete customer with existing invoices',
      );
    }

    await this.prisma.customer.delete({ where: { id } });
    return { message: `Customer "${customer.name}" deleted` };
  }

  async getStatement(id: string, companyId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId)
      throw new BadRequestException('Customer does not belong to this company');

    const invoices = await this.prisma.invoice.findMany({
      where: { customerId: id, status: { not: 'CANCELLED' } },
      orderBy: { issueDate: 'asc' },
      select: {
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
      },
    });

    const totalInvoiced = invoices.reduce(
      (sum, inv) => sum.plus(new Decimal(inv.totalAmount)),
      new Decimal(0),
    );
    const totalPaid = invoices.reduce(
      (sum, inv) => sum.plus(new Decimal(inv.paidAmount)),
      new Decimal(0),
    );
    const totalOutstanding = totalInvoiced.minus(totalPaid);

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      invoices,
      summary: {
        totalInvoiced: totalInvoiced.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: totalOutstanding.toFixed(2),
        invoiceCount: invoices.length,
      },
    };
  }
}
