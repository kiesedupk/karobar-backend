import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';

@Injectable()
export class DebitNotesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateDebitNoteDto) {
    return this.prisma.$transaction(async (tx: any) => {
      // Calculate item totals
      let subTotal = 0;
      let totalTax = 0;
      const itemsData = dto.items.map((item) => {
        const base = item.quantity * item.unitCost;
        const tax = base * ((item.taxRate || 0) / 100);
        const total = base + tax;
        subTotal += base;
        totalTax += tax;
        return {
          productId: item.productId || null,
          description: item.description,
          quantity: item.quantity,
          unitCost: item.unitCost,
          taxRate: item.taxRate || 0,
          taxAmount: tax,
          totalAmount: total,
        };
      });
      const grandTotal = subTotal + totalTax;

      // Create Debit Note
      const debitNote = await tx.debitNote.create({
        data: {
          companyId: dto.companyId,
          vendorId: dto.vendorId,
          purchaseBillId: dto.purchaseBillId || null,
          debitNoteNumber: dto.debitNoteNumber,
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

      // Create Journal Entry: Debit Accounts Payable, Credit COGS
      const apAccount = await tx.account.findFirst({
        where: { companyId: dto.companyId, code: '2010' },
      });
      const cogsAccount = await tx.account.findFirst({
        where: { companyId: dto.companyId, code: '5010' },
      });

      if (apAccount && cogsAccount) {
        const je = await tx.journalEntry.create({
          data: {
            companyId: dto.companyId,
            date: new Date(dto.issueDate),
            reference: debitNote.debitNoteNumber,
            description: `Debit Note: ${dto.reason || 'Purchase Return'}`,
            status: 'POSTED',
          },
        });

        await tx.journalLine.createMany({
          data: [
            { journalEntryId: je.id, accountId: apAccount.id, debit: grandTotal, credit: 0, description: `DN: ${debitNote.debitNoteNumber}` },
            { journalEntryId: je.id, accountId: cogsAccount.id, debit: 0, credit: grandTotal, description: `DN: ${debitNote.debitNoteNumber}` },
          ],
        });

        await tx.debitNote.update({
          where: { id: debitNote.id },
          data: { journalEntryId: je.id },
        });
      }

      // Update Vendor Balance (reduce what we owe)
      const vendor = await tx.vendor.findUnique({ where: { id: dto.vendorId } });
      if (vendor) {
        await tx.vendor.update({
          where: { id: dto.vendorId },
          data: { balance: Number(vendor.balance) - grandTotal },
        });
      }

      // Auto Stock Out (remove returned items from warehouse)
      if (dto.warehouseId) {
        for (const item of dto.items) {
          if (item.productId) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            if (product && product.trackInventory) {
              const prevQty = Number(product.currentStock);
              const newQty = prevQty - item.quantity;
              await tx.product.update({
                where: { id: item.productId },
                data: { currentStock: newQty },
              });

              const whStock = await tx.warehouseStock.findUnique({
                where: { warehouseId_productId: { warehouseId: dto.warehouseId, productId: item.productId } },
              });
              if (whStock) {
                await tx.warehouseStock.update({
                  where: { id: whStock.id },
                  data: { quantity: Math.max(0, Number(whStock.quantity) - item.quantity) },
                });
              }

              await tx.stockTransaction.create({
                data: {
                  companyId: dto.companyId,
                  warehouseId: dto.warehouseId,
                  productId: item.productId,
                  type: 'OUT',
                  quantity: item.quantity,
                  previousQty: prevQty,
                  newQty: newQty,
                  reference: debitNote.debitNoteNumber,
                  sourceType: 'DEBIT_NOTE',
                  sourceId: debitNote.id,
                  reason: 'Purchase Return',
                },
              });
            }
          }
        }
      }

      return debitNote;
    });
  }

  async findAll(companyId: string) {
    return this.prisma.debitNote.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        vendor: { select: { name: true } },
        purchaseBill: { select: { billNumber: true } },
      },
    });
  }

  async findOne(id: string, companyId: string) {
    const dn = await this.prisma.debitNote.findFirst({
      where: { id, companyId },
      include: {
        vendor: { select: { name: true, email: true, phone: true } },
        purchaseBill: { select: { billNumber: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
      },
    });
    if (!dn) throw new NotFoundException('Debit Note not found');
    return dn;
  }
}
