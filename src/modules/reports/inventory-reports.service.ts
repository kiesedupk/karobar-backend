import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

export interface DateFilter {
  startDate?: string;
  endDate?: string;
}

@Injectable()
export class InventoryReportsService {
  constructor(private prisma: PrismaService) {}

  private async validateCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');
  }

  // ================================================================
  // 1. STOCK SUMMARY REPORT
  // ================================================================
  async getStockSummary(companyId: string) {
    await this.validateCompany(companyId);

    const products = await this.prisma.product.findMany({
      where: { companyId, trackInventory: true },
      include: {
        category: { select: { name: true } },
        uom: { select: { symbol: true } },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => ({
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      category: p.category?.name || 'Uncategorized',
      unit: p.uom?.symbol || '',
      currentStock: Number(p.currentStock),
      reorderPoint: Number(p.reorderPoint || 0),
      status: Number(p.currentStock) <= Number(p.reorderPoint || 0) ? 'LOW_STOCK' : 'IN_STOCK',
    }));
  }

  // ================================================================
  // 2. STOCK VALUATION REPORT (FIFO based)
  // ================================================================
  async getStockValuation(companyId: string) {
    await this.validateCompany(companyId);

    // Fetch all active products
    const products = await this.prisma.product.findMany({
      where: { companyId, trackInventory: true },
      include: {
        category: { select: { name: true } },
      },
    });

    // Fetch all active FIFO layers
    const activeLayers = await this.prisma.inventoryFifoLayer.findMany({
      where: { companyId, remainingQty: { gt: 0 } },
    });

    // Group layers by product
    const layersByProduct = new Map<string, typeof activeLayers>();
    for (const layer of activeLayers) {
      if (!layersByProduct.has(layer.productId)) {
        layersByProduct.set(layer.productId, []);
      }
      layersByProduct.get(layer.productId)!.push(layer);
    }

    let totalValuation = new Decimal(0);

    const reportLines = products.map((p) => {
      const layers = layersByProduct.get(p.id) || [];
      let productValuation = new Decimal(0);
      let totalQty = new Decimal(0);

      // Sum valuation from FIFO layers
      layers.forEach((layer) => {
        const qty = new Decimal(layer.remainingQty);
        const cost = new Decimal(layer.unitCost);
        productValuation = productValuation.plus(qty.mul(cost));
        totalQty = totalQty.plus(qty);
      });

      totalValuation = totalValuation.plus(productValuation);

      // Average unit cost based on FIFO layers
      const avgUnitCost = totalQty.greaterThan(0)
        ? productValuation.dividedBy(totalQty).toFixed(2)
        : new Decimal(p.costPrice || 0).toFixed(2);

      return {
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        category: p.category?.name || 'Uncategorized',
        quantityOnHand: totalQty.toNumber(),
        avgUnitCost,
        totalValue: productValuation.toFixed(2),
        standardCostPrice: new Decimal(p.costPrice || 0).toFixed(2), // For comparison
      };
    });

    return {
      totalInventoryValue: totalValuation.toFixed(2),
      items: reportLines,
    };
  }

  // ================================================================
  // 3. LOW STOCK REPORT
  // ================================================================
  async getLowStockReport(companyId: string) {
    await this.validateCompany(companyId);

    const products = await this.prisma.product.findMany({
      where: {
        companyId,
        trackInventory: true,
      },
      include: {
        category: { select: { name: true } },
        uom: { select: { symbol: true } },
      },
    });

    const lowStockProducts = products.filter(
      (p) => Number(p.currentStock) <= Number(p.reorderPoint || 0),
    );

    return lowStockProducts.map((p) => ({
      productId: p.id,
      productSku: p.sku,
      productName: p.name,
      category: p.category?.name || 'Uncategorized',
      unit: p.uom?.symbol || '',
      currentStock: Number(p.currentStock),
      reorderPoint: Number(p.reorderPoint || 0),
      shortage: Number(p.reorderPoint || 0) - Number(p.currentStock),
    }));
  }

  // ================================================================
  // 4. WAREHOUSE INVENTORY REPORT
  // ================================================================
  async getWarehouseStockReport(companyId: string, warehouseId: string) {
    await this.validateCompany(companyId);

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: warehouseId, companyId },
    });

    if (!warehouse) throw new NotFoundException('Warehouse not found');

    const stock = await this.prisma.warehouseStock.findMany({
      where: { warehouseId, companyId, quantity: { gt: 0 } },
      include: {
        product: {
          include: {
            category: { select: { name: true } },
            uom: { select: { symbol: true } },
          },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
      },
      items: stock.map((s) => ({
        productId: s.productId,
        productSku: s.product.sku,
        productName: s.product.name,
        category: s.product.category?.name || 'Uncategorized',
        unit: s.product.uom?.symbol || '',
        quantity: Number(s.quantity),
      })),
    };
  }

  // ================================================================
  // 5. INVENTORY MOVEMENT REPORT
  // ================================================================
  async getInventoryMovement(
    companyId: string,
    filters: DateFilter & { productId?: string; warehouseId?: string },
  ) {
    await this.validateCompany(companyId);

    const where: any = { companyId };
    
    if (filters.productId) where.productId = filters.productId;
    if (filters.warehouseId) where.warehouseId = filters.warehouseId;

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    const transactions = await this.prisma.stockTransaction.findMany({
      where,
      include: {
        product: { select: { name: true, sku: true } },
        warehouse: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    return transactions.map((t) => ({
      id: t.id,
      date: t.createdAt,
      productName: t.product.name,
      productSku: t.product.sku,
      warehouseName: t.warehouse.name,
      type: t.type,
      quantityChange: Number(t.quantity),
      previousQty: Number(t.previousQty),
      newQty: Number(t.newQty),
      sourceType: t.sourceType,
      reference: t.reference,
      notes: t.notes,
    }));
  }

  // ================================================================
  // 6. INVENTORY DASHBOARD OVERVIEW
  // ================================================================
  async getDashboardOverview(companyId: string) {
    await this.validateCompany(companyId);

    // 1. Total Stock Value
    const valuation = await this.getStockValuation(companyId);

    // 2. Low Stock Count
    const lowStock = await this.getLowStockReport(companyId);

    // 3. Warehouse Summaries
    const warehouses = await this.prisma.warehouse.findMany({
      where: { companyId },
      include: {
        stocks: {
          where: { quantity: { gt: 0 } },
        },
      },
    });

    const warehouseSummaries = warehouses.map(w => ({
      id: w.id,
      name: w.name,
      totalItems: w.stocks.length,
      totalQuantity: w.stocks.reduce((sum, s) => sum + Number(s.quantity), 0),
    }));

    // 4. Recent Movement (Last 10)
    const recentMovement = await this.getInventoryMovement(companyId, { take: 10 } as any);

    // 5. Top Selling Products (Based on Invoice Items)
    // This requires looking at InvoiceItem table
    const topSellers = await this.prisma.invoiceItem.groupBy({
      by: ['productId'],
      where: {
        invoice: { companyId, status: 'PAID' }
      },
      _sum: {
        quantity: true,
        totalAmount: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc'
        }
      },
      take: 5
    });

    // Resolve product names for top sellers
    const topProducts = await Promise.all(topSellers.map(async (item) => {
      if (!item.productId) return null;
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true, sku: true }
      });
      return {
        productId: item.productId,
        name: product?.name || 'Unknown',
        sku: product?.sku || '',
        totalQty: Number(item._sum.quantity || 0),
        totalRevenue: Number(item._sum.totalAmount || 0),
      };
    }));

    return {
      totalStockValue: valuation.totalInventoryValue,
      lowStockCount: lowStock.length,
      lowStockItems: lowStock.slice(0, 5), // Return first 5 for the widget
      warehouseSummaries,
      recentMovement: recentMovement.slice(0, 5),
      topSellingProducts: topProducts.filter(Boolean),
    };
  }
}
