import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePosSessionDto, PosCheckoutDto, ClosePosSessionDto } from './dto/pos.dto';
import { InventoryService } from '../inventory/inventory.service';
import { Decimal } from '@prisma/client/runtime/library';

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

  async getSessionSummary(companyId: string, id: string) {
    const session = await this.prisma.posSession.findUnique({
      where: { id },
      include: {
        invoices: {
          include: { payments: true }
        }
      }
    });

    if (!session || session.companyId !== companyId) throw new NotFoundException('Session not found');

    const summary = {
      openingBalance: Number(session.openingBalance),
      cashSales: 0,
      cardSales: 0,
      bankSales: 0,
      totalSales: 0,
      expectedCash: 0,
    };

    session.invoices.forEach(inv => {
      inv.payments.forEach(p => {
        const amt = Number(p.amount);
        if (p.method === 'CASH') summary.cashSales += amt;
        else if (p.method === 'CARD') summary.cardSales += amt;
        else if (p.method === 'BANK') summary.bankSales += amt;
      });
      summary.totalSales += Number(inv.totalAmount);
    });

    summary.expectedCash = summary.openingBalance + summary.cashSales;

    return summary;
  }

  async closeSession(companyId: string, id: string, dto: ClosePosSessionDto) {
    const session = await this.prisma.posSession.findUnique({ 
      where: { id },
      include: { warehouse: true }
    });
    
    if (!session || session.companyId !== companyId) throw new NotFoundException('Session not found');
    if (session.status === 'CLOSED') throw new BadRequestException('Session already closed');

    const summary = await this.getSessionSummary(companyId, id);
    const variance = Number(dto.closingBalance) - summary.expectedCash;

    return this.prisma.$transaction(async (tx) => {
      // 1. Update Session
      const updatedSession = await tx.posSession.update({
        where: { id },
        data: {
          status: 'CLOSED',
          closedAt: new Date(),
          closingBalance: dto.closingBalance,
          notes: dto.notes,
        },
      });

      // 2. Handle Variance Accounting
      if (Math.abs(variance) > 0.01) {
        // Find Accounts
        const cashAccount = await tx.account.findFirst({ where: { companyId, code: '1010' } });
        const varianceAccount = await tx.account.findFirst({ 
          where: { companyId, code: variance < 0 ? '5900' : '4100' } // 5900 Exp if shortage, 4100 Income if overage
        });

        if (cashAccount && varianceAccount) {
          await tx.journalEntry.create({
            data: {
              companyId,
              date: new Date(),
              reference: `VAR-${session.id.slice(0, 8)}`,
              description: `POS Cash Reconciliation Variance (${variance < 0 ? 'Shortage' : 'Overage'})`,
              status: 'POSTED',
              lines: {
                create: [
                  {
                    accountId: cashAccount.id,
                    debit: variance > 0 ? variance : 0,
                    credit: variance < 0 ? Math.abs(variance) : 0,
                    description: 'Cash reconciliation adjustment'
                  },
                  {
                    accountId: varianceAccount.id,
                    debit: variance < 0 ? Math.abs(variance) : 0,
                    credit: variance > 0 ? variance : 0,
                    description: 'POS Variance recognition'
                  }
                ]
              }
            }
          });
        }
      }

      return updatedSession;
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

    // -------------------------------------------------------
    // PRE-TRANSACTION: Resolve all accounts BEFORE the transaction
    // to avoid slow queries inside transaction causing P2028 timeout
    // -------------------------------------------------------
    const requiredCodes = ['1010', '1020', '1100', '1200', '2200', '4010', '5010'];
    const existingAccounts = await this.prisma.account.findMany({
      where: { companyId, code: { in: requiredCodes } }
    });

    const accountMap: Record<string, string> = {};
    for (const acct of existingAccounts) {
      accountMap[acct.code] = acct.id;
    }

    // Auto-create any missing accounts before entering the transaction
    const accountDefs = [
      { code: '1010', name: 'Cash on Hand', type: 'ASSET', subType: 'CASH' },
      { code: '1020', name: 'Bank Accounts', type: 'ASSET', subType: 'BANK' },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subType: 'RECEIVABLE' },
      { code: '1200', name: 'Inventory', type: 'ASSET', subType: 'INVENTORY' },
      { code: '2200', name: 'GST / Sales Tax Payable', type: 'LIABILITY', subType: 'TAX' },
      { code: '4010', name: 'Sales Revenue', type: 'REVENUE', subType: 'SALES' },
      { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', subType: 'COGS' },
    ];

    for (const def of accountDefs) {
      if (!accountMap[def.code]) {
        const created = await this.prisma.account.upsert({
          where: { companyId_code: { companyId, code: def.code } },
          update: {},
          create: { companyId, code: def.code, name: def.name, type: def.type as any, subType: def.subType, isActive: true }
        });
        accountMap[def.code] = created.id;
      }
    }

    const cashAccountId = accountMap['1010'];
    const bankAccountId = accountMap['1020'];
    const arAccountId = accountMap['1100'];
    const inventoryAccountId = accountMap['1200'];
    const taxAccountId = accountMap['2200'];
    const salesAccountId = accountMap['4010'];
    const cogsAccountId = accountMap['5010'];

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
      let totalCogs = 0;

      const itemsWithDetails = await Promise.all(dto.items.map(async (item) => {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
        
        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
        const discount = (lineTotal * (item.discountRate || 0)) / 100;
        const netTotal = lineTotal - discount;
        
        const cogs = Number(item.quantity) * Number(product.costPrice || 0);
        
        subTotal += lineTotal;
        totalDiscount += discount;
        totalCogs += cogs;
        
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

      // 6. Accounting Journal Entries
      const journalLines = [];
      
      // Credit: Sales Revenue
      journalLines.push({
        accountId: salesAccountId,
        credit: subTotal - totalDiscount,
        debit: 0,
        description: `POS Sale - ${invoiceNumber}`
      });

      // Credit: Tax Payable
      if (totalTax > 0) {
        journalLines.push({
          accountId: taxAccountId,
          credit: totalTax,
          debit: 0,
          description: `Tax on ${invoiceNumber}`
        });
      }

      // Debit: Payments (Cash / Bank)
      let recordedPaymentTotal = 0;
      for (const payment of paymentsToRecord) {
        if (payment.amount > 0) {
          recordedPaymentTotal += payment.amount;
          journalLines.push({
            accountId: payment.method === 'CASH' ? cashAccountId : bankAccountId,
            debit: payment.amount,
            credit: 0,
            description: `Payment for ${invoiceNumber} via ${payment.method}`
          });
        }
      }

      // Debit: Accounts Receivable (for any unpaid balance)
      const balanceDue = totalAmount - recordedPaymentTotal;
      if (balanceDue > 0) {
        journalLines.push({
          accountId: arAccountId,
          debit: balanceDue,
          credit: 0,
          description: `Unpaid balance for ${invoiceNumber}`
        });
      }

      // Create Sales Journal Entry
      const salesJournal = await tx.journalEntry.create({
        data: {
          companyId,
          date: new Date(),
          reference: invoiceNumber,
          description: `POS Checkout ${invoiceNumber}`,
          status: 'POSTED',
          lines: { create: journalLines }
        }
      });
      
      // Link Journal Entry to Invoice
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { journalEntryId: salesJournal.id }
      });

      // 7. COGS & Inventory Journal Entry
      if (totalCogs > 0) {
        await tx.journalEntry.create({
          data: {
            companyId,
            date: new Date(),
            reference: `COGS-${invoiceNumber}`,
            description: `Cost of Goods Sold for ${invoiceNumber}`,
            status: 'POSTED',
            lines: {
              create: [
                {
                  accountId: cogsAccountId,
                  debit: totalCogs,
                  credit: 0,
                  description: `COGS for ${invoiceNumber}`
                },
                {
                  accountId: inventoryAccountId,
                  credit: totalCogs,
                  debit: 0,
                  description: `Inventory reduction for ${invoiceNumber}`
                }
              ]
            }
          }
        });
      }

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
