import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVendorDto, UpdateVendorDto } from './dto/vendor.dto';

@Injectable()
export class VendorsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVendorDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    return this.prisma.vendor.create({
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

    const [vendors, total] = await Promise.all([
      this.prisma.vendor.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: Math.min(limit, 100),
      }),
      this.prisma.vendor.count({ where }),
    ]);

    return {
      data: vendors,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / Math.min(limit, 100)),
      },
    };
  }

  async findOne(id: string, companyId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.companyId !== companyId)
      throw new BadRequestException('Vendor does not belong to this company');
    return vendor;
  }

  async update(id: string, companyId: string, dto: UpdateVendorDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.companyId !== companyId)
      throw new BadRequestException('Vendor does not belong to this company');

    return this.prisma.vendor.update({ where: { id }, data: dto });
  }

  async remove(id: string, companyId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.companyId !== companyId)
      throw new BadRequestException('Vendor does not belong to this company');

    await this.prisma.vendor.delete({ where: { id } });
    return { message: `Vendor "${vendor.name}" deleted` };
  }

  async getStatement(id: string, companyId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.companyId !== companyId)
      throw new BadRequestException('Vendor does not belong to this company');

    const bills = await this.prisma.purchaseBill.findMany({
      where: { vendorId: id, companyId },
      orderBy: { billDate: 'asc' },
      select: {
        id: true,
        billNumber: true,
        billDate: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
      },
    });

    let totalBilled = 0;
    let totalPaid = 0;
    for (const b of bills) {
      totalBilled += Number(b.totalAmount);
      totalPaid += Number(b.paidAmount);
    }

    return {
      vendor: { id: vendor.id, name: vendor.name, email: vendor.email, phone: vendor.phone },
      bills,
      summary: {
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalOutstanding: (totalBilled - totalPaid).toFixed(2),
        billCount: bills.length,
      },
    };
  }
}
