import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateProductDto) {
    if (dto.sku) {
      const existing = await this.prisma.product.findUnique({
        where: { companyId_sku: { companyId, sku: dto.sku } },
      });
      if (existing) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    if (dto.barcode) {
      const existing = await this.prisma.product.findUnique({
        where: { companyId_barcode: { companyId, barcode: dto.barcode } },
      });
      if (existing) {
        throw new ConflictException('Product with this Barcode already exists');
      }
    }

    return this.prisma.product.create({
      data: { ...dto, companyId },
    });
  }

  async findAll(
    companyId: string,
    page: number = 1,
    limit: number = 20,
    search?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          category: true,
          uom: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items,
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(companyId: string, id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, companyId },
      include: {
        category: true,
        uom: true,
        incomeAccount: true,
        expenseAccount: true,
        assetAccount: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(companyId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(companyId, id); // Verify existence

    if (dto.sku) {
      const existing = await this.prisma.product.findUnique({
        where: { companyId_sku: { companyId, sku: dto.sku } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Product with this SKU already exists');
      }
    }

    return this.prisma.product.update({
      where: { id, companyId },
      data: dto,
    });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.product.delete({
      where: { id, companyId },
    });
  }

  async findByLookup(companyId: string, code: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        companyId,
        OR: [
          { sku: code },
          { barcode: code },
        ],
      },
      include: {
        category: true,
        uom: true,
      },
    });

    if (!product) throw new NotFoundException('Product not found with this code');
    return product;
  }
}
