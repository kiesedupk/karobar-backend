import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStockTakeDto, StockTakeItemDto } from './dto/create-stock-take.dto';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class StockTakeService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  async create(companyId: string, userId: string, dto: CreateStockTakeDto) {
    // 1. Get current stock for all products in this warehouse
    const currentStocks = await this.prisma.warehouseStock.findMany({
      where: { warehouseId: dto.warehouseId, companyId },
      include: { product: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const stockTake = await tx.stockTake.create({
        data: {
          companyId,
          warehouseId: dto.warehouseId,
          notes: dto.notes,
          performedBy: userId,
          status: 'DRAFT',
        },
      });

      // 2. Initialize items with system quantities
      const itemsData = currentStocks.map(s => ({
        stockTakeId: stockTake.id,
        productId: s.productId,
        systemQuantity: s.quantity,
        physicalQuantity: s.quantity, // Default to system quantity
        discrepancy: 0,
      }));

      await tx.stockTakeItem.createMany({
        data: itemsData,
      });

      return tx.stockTake.findUnique({
        where: { id: stockTake.id },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async updateItems(companyId: string, id: string, items: StockTakeItemDto[]) {
    const stockTake = await this.prisma.stockTake.findUnique({
      where: { id },
    });

    if (!stockTake || stockTake.companyId !== companyId) {
      throw new NotFoundException('Stock take not found');
    }
    if (stockTake.status !== 'DRAFT') {
      throw new BadRequestException('Cannot update a completed or cancelled stock take');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const existingItem = await tx.stockTakeItem.findFirst({
          where: { stockTakeId: id, productId: item.productId },
        });

        if (existingItem) {
          const discrepancy = Number(item.physicalQuantity) - Number(existingItem.systemQuantity);
          await tx.stockTakeItem.update({
            where: { id: existingItem.id },
            data: {
              physicalQuantity: item.physicalQuantity,
              discrepancy: discrepancy,
              notes: item.notes,
            },
          });
        }
      }

      return tx.stockTake.findUnique({
        where: { id },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async complete(companyId: string, id: string, userId: string) {
    const stockTake = await this.prisma.stockTake.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!stockTake || stockTake.companyId !== companyId) {
      throw new NotFoundException('Stock take not found');
    }
    if (stockTake.status !== 'DRAFT') {
      throw new BadRequestException('Stock take is already completed or cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Process discrepancies
      for (const item of stockTake.items) {
        const discrepancy = Number(item.discrepancy);
        if (discrepancy !== 0) {
          const type = discrepancy > 0 ? 'INCREASE' : 'DECREASE';
          const qty = Math.abs(discrepancy);

          // Create and auto-approve an adjustment
          const adjustment = await tx.stockAdjustment.create({
            data: {
              companyId,
              warehouseId: stockTake.warehouseId,
              productId: item.productId,
              type,
              quantity: qty,
              reason: 'CORRECTION',
              notes: `Auto-adjusted from Stock Take #${stockTake.id.slice(0, 8)}`,
              status: 'APPROVED',
              performedBy: userId,
              approvedBy: userId,
              stockTakeItemId: item.id,
            },
          });

          // Apply stock change
          await this.inventoryService.adjustStock(tx, {
            companyId,
            warehouseId: stockTake.warehouseId,
            productId: item.productId,
            quantity: qty,
            type: type as 'INCREASE' | 'DECREASE',
            sourceType: 'STOCK_TAKE',
            sourceId: stockTake.id,
            reason: 'CORRECTION',
            performedBy: userId,
          });
        }
      }

      // 2. Mark stock take as completed
      return tx.stockTake.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
        include: { items: { include: { product: true } } },
      });
    });
  }

  async findAll(companyId: string, warehouseId?: string) {
    return this.prisma.stockTake.findMany({
      where: { companyId, ...(warehouseId && { warehouseId }) },
      include: { warehouse: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const stockTake = await this.prisma.stockTake.findUnique({
      where: { id },
      include: {
        warehouse: true,
        items: { include: { product: true } },
      },
    });

    if (!stockTake || stockTake.companyId !== companyId) {
      throw new NotFoundException('Stock take not found');
    }
    return stockTake;
  }
}
