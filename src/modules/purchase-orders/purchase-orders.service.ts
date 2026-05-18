import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../common/audit/audit.service';
import { PeriodsService } from '../periods/periods.service';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private periodsService: PeriodsService,
  ) {}

  private async generateOrderNumber(companyId: string): Promise<string> {
    const today = new Date();
    const prefix = `PO-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const count = await this.prisma.purchaseOrder.count({
      where: {
        companyId,
        orderNumber: { startsWith: prefix },
      },
    });
    return `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
  }

  async create(dto: CreatePurchaseOrderDto) {
    const { companyId, vendorId, warehouseId, items, notes, orderDate, expectedDate } = dto;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor || vendor.companyId !== companyId) throw new NotFoundException('Vendor not found');

    const orderNumber = dto.orderNumber || (await this.generateOrderNumber(companyId));

    const existing = await this.prisma.purchaseOrder.findUnique({
      where: { companyId_orderNumber: { companyId, orderNumber } },
    });
    if (existing) throw new ConflictException(`Order number "${orderNumber}" already exists`);

    const calculatedItems = items.map((item) => {
      const lineSubTotal = new Decimal(item.quantity).mul(new Decimal(item.unitCost));
      const taxRate = new Decimal(item.taxRate || 0);
      const taxAmount = lineSubTotal.mul(taxRate).div(100);
      const totalAmount = lineSubTotal.plus(taxAmount);

      return {
        productId: item.productId,
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitCost: new Decimal(item.unitCost),
        taxRate,
        taxAmount,
        totalAmount,
      };
    });

    let subTotal = new Decimal(0);
    let totalTax = new Decimal(0);

    for (const ci of calculatedItems) {
      subTotal = subTotal.plus(ci.quantity.mul(ci.unitCost));
      totalTax = totalTax.plus(ci.taxAmount);
    }

    const totalAmount = subTotal.plus(totalTax);

    const purchaseOrder = await this.prisma.purchaseOrder.create({
      data: {
        companyId,
        vendorId,
        warehouseId,
        orderNumber,
        orderDate: orderDate ? new Date(orderDate) : new Date(),
        expectedDate: expectedDate ? new Date(expectedDate) : null,
        subTotal,
        taxAmount: totalTax,
        totalAmount,
        status: 'DRAFT',
        notes: notes || null,
        items: {
          create: calculatedItems,
        },
      },
      include: {
        vendor: { select: { id: true, name: true } },
        items: true,
      },
    });

    this.auditService.log({
      companyId,
      action: 'CREATE',
      entity: 'PurchaseOrder',
      entityId: purchaseOrder.id,
      description: `Purchase Order ${orderNumber} created for ${vendor.name}`,
    });

    return purchaseOrder;
  }

  async findAll(companyId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: { companyId },
      include: { vendor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        vendor: true,
        items: { include: { product: true } },
      },
    });
    if (!purchaseOrder || purchaseOrder.companyId !== companyId) {
      throw new NotFoundException('Purchase Order not found');
    }
    return purchaseOrder;
  }

  async updateStatus(companyId: string, id: string, status: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder || purchaseOrder.companyId !== companyId) throw new NotFoundException('Purchase Order not found');

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
    });

    this.auditService.log({
      companyId,
      action: 'UPDATE',
      entity: 'PurchaseOrder',
      entityId: id,
      description: `Purchase Order ${purchaseOrder.orderNumber} status changed to ${status}`,
    });

    return updated;
  }

  async convertToBill(companyId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!purchaseOrder || purchaseOrder.companyId !== companyId) throw new NotFoundException('Purchase Order not found');

    await this.updateStatus(companyId, id, 'COMPLETED');

    return {
      message: 'Conversion prepared',
      purchaseOrder,
    };
  }

  async delete(companyId: string, id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!purchaseOrder || purchaseOrder.companyId !== companyId) throw new NotFoundException('Purchase Order not found');

    await this.prisma.purchaseOrder.delete({ where: { id } });

    this.auditService.log({
      companyId,
      action: 'DELETE',
      entity: 'PurchaseOrder',
      entityId: id,
      description: `Purchase Order ${purchaseOrder.orderNumber} deleted`,
    });

    return { message: 'Purchase Order deleted successfully' };
  }
}
