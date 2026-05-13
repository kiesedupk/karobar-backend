import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { StockInDto, StockOutDto, StockAdjustmentDto } from './dto/stock-transaction.dto';

const prisma = new PrismaClient();

@Injectable()
export class StockTransactionsService {

  // ========================================
  // STOCK IN — Add inventory to a warehouse
  // ========================================
  async stockIn(companyId: string, dto: StockInDto) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify product exists
      const product = await tx.product.findFirst({
        where: { id: dto.productId, companyId },
      });
      if (!product) throw new NotFoundException('Product not found');

      // 2. Upsert warehouse stock
      const existingStock = await tx.warehouseStock.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
          },
        },
      });

      const previousQty = existingStock ? Number(existingStock.quantity) : 0;
      const newQty = previousQty + dto.quantity;

      if (existingStock) {
        await tx.warehouseStock.update({
          where: { id: existingStock.id },
          data: { quantity: newQty },
        });
      } else {
        await tx.warehouseStock.create({
          data: {
            companyId,
            warehouseId: dto.warehouseId,
            productId: dto.productId,
            quantity: dto.quantity,
          },
        });
      }

      // 3. Update product total stock
      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: { increment: dto.quantity } },
      });

      // 4. Record the transaction
      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          type: 'STOCK_IN',
          quantity: dto.quantity,
          previousQty,
          newQty,
          reference: dto.reference,
          sourceType: dto.sourceType || 'PURCHASE',
          sourceId: dto.sourceId,
          notes: dto.notes,
        },
        include: { product: true, warehouse: true },
      });

      // 5. Audit log
      await tx.auditLog.create({
        data: {
          companyId,
          action: 'STOCK_IN',
          entity: 'StockTransaction',
          entityId: transaction.id,
          description: `Stock In: ${dto.quantity} x ${product.name} → Warehouse ${dto.warehouseId}`,
          changes: JSON.stringify({ previousQty, newQty, quantity: dto.quantity }),
        },
      });

      return transaction;
    });
  }

  // ========================================
  // STOCK OUT — Remove inventory from a warehouse
  // ========================================
  async stockOut(companyId: string, dto: StockOutDto) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify product exists
      const product = await tx.product.findFirst({
        where: { id: dto.productId, companyId },
      });
      if (!product) throw new NotFoundException('Product not found');

      // 2. Check warehouse stock
      const existingStock = await tx.warehouseStock.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
          },
        },
      });

      const previousQty = existingStock ? Number(existingStock.quantity) : 0;
      if (previousQty < dto.quantity) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${previousQty}, Requested: ${dto.quantity}`,
        );
      }

      const newQty = previousQty - dto.quantity;

      // 3. Update warehouse stock
      await tx.warehouseStock.update({
        where: { id: existingStock!.id },
        data: { quantity: newQty },
      });

      // 4. Update product total stock
      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: { decrement: dto.quantity } },
      });

      // 5. Record the transaction
      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          type: 'STOCK_OUT',
          quantity: -dto.quantity,
          previousQty,
          newQty,
          reference: dto.reference,
          sourceType: dto.sourceType || 'SALE',
          sourceId: dto.sourceId,
          notes: dto.notes,
        },
        include: { product: true, warehouse: true },
      });

      // 6. Audit log
      await tx.auditLog.create({
        data: {
          companyId,
          action: 'STOCK_OUT',
          entity: 'StockTransaction',
          entityId: transaction.id,
          description: `Stock Out: ${dto.quantity} x ${product.name} ← Warehouse ${dto.warehouseId}`,
          changes: JSON.stringify({ previousQty, newQty, quantity: dto.quantity }),
        },
      });

      return transaction;
    });
  }

  // ========================================
  // STOCK ADJUSTMENT — Set quantity to a specific value
  // ========================================
  async adjust(companyId: string, dto: StockAdjustmentDto) {
    return prisma.$transaction(async (tx) => {
      // 1. Verify product
      const product = await tx.product.findFirst({
        where: { id: dto.productId, companyId },
      });
      if (!product) throw new NotFoundException('Product not found');

      // 2. Get current stock
      const existingStock = await tx.warehouseStock.findUnique({
        where: {
          warehouseId_productId: {
            warehouseId: dto.warehouseId,
            productId: dto.productId,
          },
        },
      });

      const previousQty = existingStock ? Number(existingStock.quantity) : 0;
      const difference = dto.newQuantity - previousQty;

      // 3. Upsert warehouse stock
      if (existingStock) {
        await tx.warehouseStock.update({
          where: { id: existingStock.id },
          data: { quantity: dto.newQuantity },
        });
      } else {
        await tx.warehouseStock.create({
          data: {
            companyId,
            warehouseId: dto.warehouseId,
            productId: dto.productId,
            quantity: dto.newQuantity,
          },
        });
      }

      // 4. Update product total stock
      await tx.product.update({
        where: { id: dto.productId },
        data: { currentStock: { increment: difference } },
      });

      // 5. Record the transaction
      const transaction = await tx.stockTransaction.create({
        data: {
          companyId,
          warehouseId: dto.warehouseId,
          productId: dto.productId,
          type: 'ADJUSTMENT',
          quantity: difference,
          previousQty,
          newQty: dto.newQuantity,
          reference: dto.reference,
          sourceType: 'ADJUSTMENT',
          reason: dto.reason,
          notes: dto.notes,
        },
        include: { product: true, warehouse: true },
      });

      // 6. Audit log
      await tx.auditLog.create({
        data: {
          companyId,
          action: 'STOCK_ADJUSTMENT',
          entity: 'StockTransaction',
          entityId: transaction.id,
          description: `Adjustment: ${product.name} in Warehouse — ${previousQty} → ${dto.newQuantity} (${difference >= 0 ? '+' : ''}${difference}). Reason: ${dto.reason}`,
          changes: JSON.stringify({ previousQty, newQty: dto.newQuantity, difference, reason: dto.reason }),
        },
      });

      return transaction;
    });
  }

  // ========================================
  // MOVEMENT HISTORY — Get all transactions
  // ========================================
  async getHistory(
    companyId: string,
    page = 1,
    limit = 20,
    filters?: { warehouseId?: string; productId?: string; type?: string },
  ) {
    const skip = (page - 1) * limit;
    const where: any = { companyId };

    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.type) where.type = filters.type;

    const [items, total] = await Promise.all([
      prisma.stockTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { transactionDate: 'desc' },
        include: {
          product: true,
          warehouse: true,
        },
      }),
      prisma.stockTransaction.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ========================================
  // PRODUCT STOCK SUMMARY — Across all warehouses
  // ========================================
  async getProductStockSummary(companyId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const warehouseStocks = await prisma.warehouseStock.findMany({
      where: { companyId, productId },
      include: { warehouse: true },
    });

    return {
      product,
      totalStock: Number(product.currentStock),
      warehouses: warehouseStocks.map((ws) => ({
        warehouseId: ws.warehouseId,
        warehouseName: ws.warehouse.name,
        quantity: Number(ws.quantity),
      })),
    };
  }
}
