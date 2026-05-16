import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface StockUpdateParams {
  companyId: string;
  warehouseId: string;
  productId: string;
  quantity: number;
  type: 'INCREASE' | 'DECREASE';
  sourceType: string;
  sourceId: string;
  reason?: string;
  notes?: string;
  performedBy?: string;
}

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async adjustStock(tx: Prisma.TransactionClient, params: StockUpdateParams) {
    const { companyId, warehouseId, productId, quantity, type, sourceType, sourceId, reason, notes, performedBy } = params;

    // 1. Get current stock for product in warehouse
    const warehouseStock = await tx.warehouseStock.findUnique({
      where: { warehouseId_productId: { warehouseId, productId } },
    });

    const previousQty = warehouseStock ? Number(warehouseStock.quantity) : 0;
    const adjustment = type === 'INCREASE' ? quantity : -quantity;
    const newQty = previousQty + adjustment;

    // In many POS systems, selling items before they are officially received in software is common.
    // We allow negative stock here to prevent the POS from blocking physical sales.
    // if (newQty < 0) {
    //   throw new BadRequestException(`Insufficient stock for product in warehouse. Current: ${previousQty}, Adjustment: ${adjustment}`);
    // }

    // 2. Update WarehouseStock
    if (warehouseStock) {
      await tx.warehouseStock.update({
        where: { id: warehouseStock.id },
        data: { quantity: newQty },
      });
    } else {
      await tx.warehouseStock.create({
        data: {
          companyId,
          warehouseId,
          productId,
          quantity: newQty,
        },
      });
    }

    // 3. Update Product Total Stock
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product) throw new BadRequestException('Product not found');

    const totalNewQty = Number(product.currentStock) + adjustment;
    await tx.product.update({
      where: { id: productId },
      data: { currentStock: totalNewQty },
    });

    // 4. Create StockTransaction Log
    return tx.stockTransaction.create({
      data: {
        companyId,
        warehouseId,
        productId,
        type: type,
        quantity: quantity,
        previousQty: previousQty,
        newQty: newQty,
        sourceType,
        sourceId,
        reason,
        notes,
        performedBy,
      },
    });
  }
}
