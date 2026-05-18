import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';

@Injectable()
export class CreditNotesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCreditNoteDto) {
    return this.prisma.$transaction(async (tx: any) => {
      // Calculate item totals
      let subTotal = 0;
      let totalTax = 0;
      const itemsData = dto.items.map((item) => {
        const base = item.quantity * item.unitPrice;
        const tax = base * ((item.taxRate || 0) / 100);
        const total = base + tax;
        subTotal += base;
        totalTax += tax;
        return {
          productId: item.productId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate || 0,
          taxAmount: tax,
          totalAmount: total,
        };
      });
      const grandTotal = subTotal + totalTax;

      // Create Credit Note
      const creditNote = await tx.creditNote.create({
        data: {
          companyId: dto.companyId,
          customerId: dto.customerId,
          invoiceId: dto.invoiceId || null,
          creditNoteNumber: dto.creditNoteNumber,
          issueDate: new Date(dto.issueDate),
          subTotal,
          taxAmount: totalTax,
          totalAmount: grandTotal,
          reason: dto.reason,
          warehouseId: dto.warehouseId || null,
          notes: dto.notes,
          status: 'POSTED',
          items: { create: itemsData },
        },
        include: { items: true },
      });

      // Create Journal Entry: Debit Sales Revenue, Credit Accounts Receivable
      const revenueAccount = await tx.account.findFirst({
        where: { companyId: dto.companyId, code: '4010' },
      });
      const arAccount = await tx.account.findFirst({
        where: { companyId: dto.companyId, code: '1100' },
      });

      if (revenueAccount && arAccount) {
        const je = await tx.journalEntry.create({
          data: {
            companyId: dto.companyId,
            date: new Date(dto.issueDate),
            reference: creditNote.creditNoteNumber,
            description: `Credit Note: ${dto.reason || 'Sales Return'}`,
            status: 'POSTED',
          },
        });

        await tx.journalLine.createMany({
          data: [
            { journalEntryId: je.id, accountId: revenueAccount.id, debit: grandTotal, credit: 0, description: `CN: ${creditNote.creditNoteNumber}` },
            { journalEntryId: je.id, accountId: arAccount.id, debit: 0, credit: grandTotal, description: `CN: ${creditNote.creditNoteNumber}` },
          ],
        });

        await tx.creditNote.update({
          where: { id: creditNote.id },
          data: { journalEntryId: je.id },
        });
      }

      // Update Customer Balance (reduce what they owe)
      const customer = await tx.customer.findUnique({ where: { id: dto.customerId } });
      if (customer) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { balance: Number(customer.balance) - grandTotal },
        });
      }

      // Auto Stock In (return items to warehouse)
      if (dto.warehouseId) {
        for (const item of dto.items) {
          if (item.productId) {
            // Update product stock
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product && product.trackInventory) {
              const prevQty = Number(product.currentStock);
              const newQty = prevQty + item.quantity;
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: newQty },
              });

              // Update warehouse stock
              const whStock = await tx.warehouseStock.findUnique({
                where: { warehouseId_productId: { warehouseId: dto.warehouseId, productId: item.productId } },
              });
              if (whStock) {
                await tx.warehouseStock.update({
                  where: { id: whStock.id },
                  data: { quantity: Number(whStock.quantity) + item.quantity },
                });
              } else {
                await tx.warehouseStock.create({
                  data: { companyId: dto.companyId, warehouseId: dto.warehouseId, productId: item.productId, quantity: item.quantity },
                });
              }

              // Log stock transaction
              await tx.stockTransaction.create({
                data: {
                  companyId: dto.companyId,
                  warehouseId: dto.warehouseId,
                  productId: item.productId,
                  type: 'IN',
                  quantity: item.quantity,
                  previousQty: prevQty,
                  newQty: newQty,
                  reference: creditNote.creditNoteNumber,
                  sourceType: 'CREDIT_NOTE',
                  sourceId: creditNote.id,
                  reason: 'Sales Return',
                },
              });
            }
          }
        }
      }

      return creditNote;
    });
  }

  async findAll(companyId: string) {
    return this.prisma.creditNote.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    const cn = await this.prisma.creditNote.findFirst({
      where: { id, companyId },
      include: {
        customer: { select: { name: true, email: true, phone: true } },
        invoice: { select: { invoiceNumber: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
    if (!cn) throw new NotFoundException('Credit Note not found');
    return cn;
  }
}
