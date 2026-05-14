import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStockAdjustmentDto } from './dto/create-stock-adjustment.dto';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class StockAdjustmentsService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  async create(companyId: string, userId: string, dto: CreateStockAdjustmentDto) {
    return this.prisma.stockAdjustment.create({
      data: {
        ...dto,
        companyId,
        performedBy: userId,
        status: 'PENDING',
      },
    });
  }

  async findAll(companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { companyId };

    const [items, total] = await Promise.all([
      this.prisma.stockAdjustment.findMany({
        where,
        skip,
        take: Number(limit),
        include: {
          product: true,
          warehouse: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockAdjustment.count({ where }),
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
    const adjustment = await this.prisma.stockAdjustment.findUnique({
      where: { id },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!adjustment || adjustment.companyId !== companyId) {
      throw new NotFoundException('Stock adjustment not found');
    }

    return adjustment;
  }

  async approve(companyId: string, id: string, userId: string) {
    const adjustment = await this.findOne(companyId, id);

    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(`Adjustment is already ${adjustment.status.toLowerCase()}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Apply stock change via InventoryService
      await this.inventoryService.adjustStock(tx, {
        companyId,
        warehouseId: adjustment.warehouseId,
        productId: adjustment.productId,
        quantity: Number(adjustment.quantity),
        type: adjustment.type as 'INCREASE' | 'DECREASE',
        sourceType: 'STOCK_ADJUSTMENT',
        sourceId: adjustment.id,
        reason: adjustment.reason,
        notes: adjustment.notes || undefined,
        performedBy: adjustment.performedBy || undefined,
      });

      // Mark as approved
      return tx.stockAdjustment.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
        },
      });
    });
  }

  async reject(companyId: string, id: string, userId: string) {
    const adjustment = await this.findOne(companyId, id);

    if (adjustment.status !== 'PENDING') {
      throw new BadRequestException(`Adjustment is already ${adjustment.status.toLowerCase()}`);
    }

    return this.prisma.stockAdjustment.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
      },
    });
  }
}
