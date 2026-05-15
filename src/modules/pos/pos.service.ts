import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePosSessionDto, PosCheckoutDto } from './dto/pos.dto';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  async openSession(companyId: string, userId: string, dto: CreatePosSessionDto) {
    // Check if user already has an open session in this company
    const existing = await this.prisma.posSession.findFirst({
      where: { companyId, userId, status: 'OPEN' },
    });

    if (existing) {
      throw new BadRequestException('You already have an open POS session');
    }

    return this.prisma.posSession.create({
      data: {
        ...dto,
        companyId,
        userId,
        status: 'OPEN',
      },
    });
  }

  async closeSession(companyId: string, id: string, closingBalance: number, notes?: string) {
    const session = await this.prisma.posSession.findUnique({ where: { id } });
    if (!session || session.companyId !== companyId) throw new NotFoundException('Session not found');
    if (session.status === 'CLOSED') throw new BadRequestException('Session already closed');

    return this.prisma.posSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closingBalance,
        notes: notes || session.notes,
      },
    });
  }

  async getActiveSession(companyId: string, userId: string) {
    return this.prisma.posSession.findFirst({
      where: { companyId, userId, status: 'OPEN' },
      include: { warehouse: true },
    });
  }

  async checkout(companyId: string, userId: string, dto: PosCheckoutDto) {
    const session = await this.prisma.posSession.findUnique({
      where: { id: dto.sessionId },
      include: { warehouse: true }
    });

    if (!session || session.companyId !== companyId) throw new NotFoundException('Session not found');
    if (session.status !== 'OPEN') throw new BadRequestException('Session is closed');

    return this.prisma.$transaction(async (tx) => {
      // 1. Generate Invoice Number
      const lastInvoice = await tx.invoice.findFirst({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
      });
      const nextNum = lastInvoice ? parseInt(lastInvoice.invoiceNumber.split('-')[1] || '0') + 1 : 1;
      const invoiceNumber = `POS-${nextNum.toString().padStart(6, '0')}`;

      // 2. Calculate Totals
      let subTotal = 0;
      let totalTax = 0;
      let totalDiscount = 0;

      const itemsWithDetails = await Promise.all(dto.items.map(async (item) => {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
        
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        const discount = (lineTotal * (item.discountRate || 0)) / 100;
        const netTotal = lineTotal - discount;
        
        subTotal += lineTotal;
        totalDiscount += discount;
        
        return {
          ...item,
          product,
          totalAmount: netTotal,
          discountAmount: discount
        };
      }));

      const totalAmount = subTotal - totalDiscount + totalTax;

      // Calculate Payments and Change
      let totalPaid = 0;
      let cashPaymentIndex = -1;
      
      const paymentsToRecord = [...dto.payments];

      paymentsToRecord.forEach((p, index) => {
        totalPaid += p.amount;
        if (p.method === 'CASH') cashPaymentIndex = index;
      });

      const changeDue = totalPaid > totalAmount ? totalPaid - totalAmount : 0;
      
      // If there is change, subtract it from the Cash payment
      if (changeDue > 0 && cashPaymentIndex >= 0) {
        paymentsToRecord[cashPaymentIndex].amount -= changeDue;
        totalPaid -= changeDue; // Adjust total paid to match exact invoice total
      }

      // 3. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          companyId,
          customerId: dto.customerId || (await this.getOrCreateDefaultCustomer(tx, companyId)),
          invoiceNumber,
          issueDate: new Date(),
          subTotal,
          discountAmount: totalDiscount,
          taxAmount: totalTax,
          totalAmount,
          paidAmount: totalPaid,
          status: totalPaid >= totalAmount ? 'PAID' : 'PARTIAL',
          notes: dto.notes,
          warehouseId: session.warehouseId,
          posSessionId: session.id,
          items: {
            create: itemsWithDetails.map(item => ({
              productId: item.productId,
              description: item.product.name,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountRate: item.discountRate || 0,
              discountAmount: item.discountAmount,
              totalAmount: item.totalAmount,
            }))
          }
        },
      });

      // 4. Record Payments
      for (const payment of paymentsToRecord) {
        if (payment.amount > 0) {
          await tx.payment.create({
            data: {
              companyId,
              invoiceId: invoice.id,
              amount: payment.amount,
              method: payment.method,
              paymentDate: new Date(),
              notes: 'POS Payment',
            }
          });
        }
      }

      // 5. Deduct Inventory & Create Logs
      for (const item of itemsWithDetails) {
        if (item.product.trackInventory) {
          await this.inventoryService.adjustStock(tx, {
            companyId,
            warehouseId: session.warehouseId,
            productId: item.productId,
            quantity: Number(item.quantity),
            type: 'DECREASE',
            sourceType: 'POS_SALE',
            sourceId: invoice.id,
            reason: 'SALE',
            performedBy: userId,
          });
        }
      }

      // 6. Accounting Integration (Simplified for now)
      // In a real scenario, we'd create a JournalEntry here.
      // For this MVP, we assume the financial tracking is handled via the Invoice and Payment records.

      return invoice;
    });
  }

  private async getOrCreateDefaultCustomer(tx: any, companyId: string) {
    let customer = await tx.customer.findFirst({
      where: { companyId, name: 'Walk-in Customer' }
    });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          companyId,
          name: 'Walk-in Customer',
        }
      });
    }
    return customer.id;
  }
}
