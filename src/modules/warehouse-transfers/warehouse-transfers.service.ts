import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateWarehouseTransferDto } from './dto/create-warehouse-transfer.dto';

const prisma = new PrismaClient();

@Injectable()
export class WarehouseTransfersService {
  async create(companyId: string, dto: CreateWarehouseTransferDto) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Source and destination warehouses cannot be the same');
    }

    return prisma.warehouseTransfer.create({
      data: {
        companyId,
        fromWarehouseId: dto.fromWarehouseId,
        toWarehouseId: dto.toWarehouseId,
        transferDate: dto.transferDate ? new Date(dto.transferDate) : new Date(),
        reference: dto.reference,
        notes: dto.notes,
        status: 'DRAFT',
        items: {
          create: dto.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    });
  }

  async findAll(companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { companyId };

    const [items, total] = await Promise.all([
      prisma.warehouseTransfer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          fromWarehouse: true,
          toWarehouse: true,
        },
      }),
      prisma.warehouseTransfer.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(companyId: string, id: string) {
    const transfer = await prisma.warehouseTransfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { product: true } },
      },
    });

    if (!transfer || transfer.companyId !== companyId) {
      throw new NotFoundException('Transfer not found');
    }
    return transfer;
  }

  async completeTransfer(companyId: string, id: string) {
    const transfer = await this.findOne(companyId, id);

    if (transfer.status === 'COMPLETED') {
      throw new BadRequestException('Transfer is already completed');
    }
    if (transfer.status === 'CANCELLED') {
      throw new BadRequestException('Cannot complete a cancelled transfer');
    }

    return prisma.$transaction(async (tx) => {
      // Deduct from source warehouse, add to destination warehouse
      for (const item of transfer.items) {
        // 1. Deduct from source
        const sourceStock = await tx.warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: transfer.fromWarehouseId,
              productId: item.productId,
            },
          },
        });

        if (!sourceStock || Number(sourceStock.quantity) < Number(item.quantity)) {
          throw new BadRequestException(`Insufficient stock for product ${item.product.name} in source warehouse`);
        }

        await tx.warehouseStock.update({
          where: { id: sourceStock.id },
          data: { quantity: Number(sourceStock.quantity) - Number(item.quantity) },
        });

        // 2. Add to destination
        const destStock = await tx.warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: transfer.toWarehouseId,
              productId: item.productId,
            },
          },
        });

        if (destStock) {
          await tx.warehouseStock.update({
            where: { id: destStock.id },
            data: { quantity: Number(destStock.quantity) + Number(item.quantity) },
          });
        } else {
          await tx.warehouseStock.create({
            data: {
              companyId,
              warehouseId: transfer.toWarehouseId,
              productId: item.productId,
              quantity: item.quantity,
            },
          });
        }
      }

      // Mark transfer as completed
      return tx.warehouseTransfer.update({
        where: { id },
        data: { status: 'COMPLETED' },
      });
    });
  }

  async cancelTransfer(companyId: string, id: string) {
    const transfer = await this.findOne(companyId, id);

    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot cancel a transfer in ${transfer.status} state`);
    }

    return prisma.warehouseTransfer.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
