import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';

const prisma = new PrismaClient();

@Injectable()
export class WarehousesService {
  async create(companyId: string, dto: CreateWarehouseDto) {
    const existing = await prisma.warehouse.findUnique({
      where: { companyId_name: { companyId, name: dto.name } },
    });
    if (existing)
      throw new ConflictException('Warehouse with this name already exists');

    return prisma.warehouse.create({
      data: { ...dto, companyId },
    });
  }

  async findAll(companyId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { companyId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.warehouse.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.warehouse.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(companyId: string, id: string) {
    const warehouse = await prisma.warehouse.findUnique({
      where: { id },
      include: {
        stocks: {
          include: { product: true },
        },
      },
    });

    if (!warehouse || warehouse.companyId !== companyId) {
      throw new NotFoundException('Warehouse not found');
    }
    return warehouse;
  }

  async update(companyId: string, id: string, dto: UpdateWarehouseDto) {
    await this.findOne(companyId, id);

    if (dto.name) {
      const existing = await prisma.warehouse.findUnique({
        where: { companyId_name: { companyId, name: dto.name } },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Another warehouse with this name already exists',
        );
      }
    }

    return prisma.warehouse.update({
      where: { id },
      data: dto,
    });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return prisma.warehouse.delete({ where: { id } });
  }
}
