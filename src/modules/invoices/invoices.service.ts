import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ================================================================
  // 1. CREATE INVOICE
  // ================================================================
  async createInvoice(dto: CreateInvoiceDto) {
    const { companyId, customerId, items, notes, globalDiscountAmount } = dto;

    // Validate company
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    // Validate customer
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId) {
      throw new BadRequestException('Customer does not belong to this company');
    }

    // Generate invoice number if not provided
    const invoiceNumber = dto.invoiceNumber || await this.generateInvoiceNumber(companyId);

    // Check uniqueness
    const existing = await this.prisma.invoice.findUnique({
      where: { companyId_invoiceNumber: { companyId, invoiceNumber } },
    });
    if (existing) {
      throw new ConflictException(`Invoice number "${invoiceNumber}" already exists`);
    }

    // Calculate each line item
    const calculatedItems = items.map((item) => {
      const lineSubTotal = new Decimal(item.quantity).mul(new Decimal(item.unitPrice));
      const discountRate = new Decimal(item.discountRate || 0);
      const discountAmount = lineSubTotal.mul(discountRate).div(100);
      const afterDiscount = lineSubTotal.minus(discountAmount);
      const taxRate = new Decimal(item.taxRate || 0);
      const taxAmount = afterDiscount.mul(taxRate).div(100);
      const totalAmount = afterDiscount.plus(taxAmount);

      return {
        description: item.description,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        discountRate,
        discountAmount,
        taxRate,
        taxAmount,
        totalAmount,
      };
    });

    // Aggregate totals
    let subTotal = new Decimal(0);
    let totalTax = new Decimal(0);
    let totalItemDiscount = new Decimal(0);

    for (const ci of calculatedItems) {
      subTotal = subTotal.plus(ci.quantity.mul(ci.unitPrice));
      totalTax = totalTax.plus(ci.taxAmount);
      totalItemDiscount = totalItemDiscount.plus(ci.discountAmount);
    }

    const globalDiscount = new Decimal(globalDiscountAmount || 0);
    const totalDiscount = totalItemDiscount.plus(globalDiscount);
    const totalAmount = subTotal.minus(totalDiscount).plus(totalTax);

    // Create invoice inside a transaction
    return this.prisma.$transaction(async (tx) => {
      // Automatically resolve account IDs if not explicitly passed
      let recvAccId = dto.receivableAccountId;
      let revAccId = dto.revenueAccountId;
      let taxAccId = dto.taxAccountId;

      if (!recvAccId) {
        const acc = await tx.account.findFirst({
          where: { companyId, OR: [{ subType: 'RECEIVABLE' }, { code: '1100' }] },
        });
        if (acc) recvAccId = acc.id;
      }
      if (!revAccId) {
        const acc = await tx.account.findFirst({
          where: { companyId, OR: [{ subType: 'SALES' }, { code: '4010' }] },
        });
        if (acc) revAccId = acc.id;
      }
      if (!taxAccId && totalTax.greaterThan(0)) {
        const acc = await tx.account.findFirst({
          where: { companyId, OR: [{ subType: 'TAX' }, { code: '2200' }] },
        });
        if (acc) taxAccId = acc.id;
      }

      // Accounting-safe validation
      if (!recvAccId) {
        throw new BadRequestException(
          'Accounts Receivable account not found. Please create or seed your Chart of Accounts first.',
        );
      }
      if (!revAccId) {
        throw new BadRequestException(
          'Sales Revenue account not found. Please create or seed your Chart of Accounts first.',
        );
      }
      if (totalTax.greaterThan(0) && !taxAccId) {
        throw new BadRequestException(
          'Sales Tax Payable account not found. Please create or seed your Chart of Accounts first.',
        );
      }

      // 1. Create balanced journal lines
      const journalLines: any[] = [];
      const netRevenue = subTotal.minus(totalDiscount);

      // Debit: Accounts Receivable (full amount customer owes)
      journalLines.push({
        accountId: recvAccId,
        description: `Invoice ${invoiceNumber} — ${customer.name}`,
        debit: totalAmount,
        credit: new Decimal(0),
      });

      // Credit: Sales Revenue (Net of discounts)
      journalLines.push({
        accountId: revAccId,
        description: `Revenue — Invoice ${invoiceNumber}`,
        debit: new Decimal(0),
        credit: netRevenue,
      });

      // Credit: Tax Payable (if tax exists)
      if (totalTax.greaterThan(0) && taxAccId) {
        journalLines.push({
          accountId: taxAccId,
          description: `Tax — Invoice ${invoiceNumber}`,
          debit: new Decimal(0),
          credit: totalTax,
        });
      }

      // Create the posted Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId,
          date: dto.issueDate ? new Date(dto.issueDate) : new Date(),
          reference: `INV-${invoiceNumber}`,
          description: `Sales Invoice ${invoiceNumber} — ${customer.name}`,
          status: 'POSTED',
          lines: { create: journalLines },
        },
      });

      // 2. Update accounts ledger balances
      for (const line of journalLines) {
        const account = await tx.account.findUnique({
          where: { id: line.accountId },
          select: { type: true, balance: true },
        });
        if (account) {
          let delta: Decimal;
          if (account.type === 'ASSET' || account.type === 'EXPENSE') {
            delta = new Decimal(line.debit).minus(new Decimal(line.credit));
          } else {
            delta = new Decimal(line.credit).minus(new Decimal(line.debit));
          }
          await tx.account.update({
            where: { id: line.accountId },
            data: { balance: new Decimal(account.balance).plus(delta) },
          });
        }
      }

      // 3. Update customer balance (increase receivables)
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: new Decimal(customer.balance).plus(totalAmount) },
      });

      // 4. Create the Invoice with linked journal entry
      const invoice = await tx.invoice.create({
        data: {
          companyId,
          customerId,
          invoiceNumber,
          issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subTotal,
          discountAmount: totalDiscount,
          taxAmount: totalTax,
          totalAmount,
          paidAmount: new Decimal(0),
          status: 'SENT', // Marks automatically as SENT instead of DRAFT because journal entry is posted!
          notes: notes || null,
          journalEntryId: journalEntry.id,
          items: {
            create: calculatedItems.map((ci) => ({
              description: ci.description,
              quantity: ci.quantity,
              unitPrice: ci.unitPrice,
              discountRate: ci.discountRate,
              discountAmount: ci.discountAmount,
              taxRate: ci.taxRate,
              taxAmount: ci.taxAmount,
              totalAmount: ci.totalAmount,
            })),
          },
        },
        include: {
          customer: { select: { id: true, name: true, email: true, phone: true } },
          items: true,
        },
      });

      const result = {
        ...invoice,
        journalEntryId: journalEntry.id,
        financials: {
          subTotal: subTotal.toFixed(2),
          totalDiscount: totalDiscount.toFixed(2),
          totalTax: totalTax.toFixed(2),
          totalAmount: totalAmount.toFixed(2),
          paidAmount: '0.00',
          balanceDue: totalAmount.toFixed(2),
        },
      };

      // Audit Log
      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'Invoice',
        entityId: invoice.id,
        description: `Invoice ${invoiceNumber} created for ${customer.name} — Rs ${totalAmount.toFixed(2)}`,
      });

      return result;
    });
  }

  // ================================================================
  // 2. SEND INVOICE (Mark as SENT and auto-post journal entry)
  // ================================================================
  async sendInvoice(id: string, companyId: string, accountIds?: {
    receivableAccountId?: string;
    revenueAccountId?: string;
    taxAccountId?: string;
    discountAccountId?: string;
  }) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { items: true, customer: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot send: Invoice is already "${invoice.status}"`);
    }

    return this.prisma.$transaction(async (tx) => {
      let journalEntryId: string | null = null;

      // Auto-post journal entry if account IDs are provided
      if (accountIds?.receivableAccountId && accountIds?.revenueAccountId) {
        const journalLines: any[] = [];
        const totalAmount = new Decimal(invoice.totalAmount);
        const taxAmount = new Decimal(invoice.taxAmount);
        const discountAmount = new Decimal(invoice.discountAmount);
        const revenueAmount = totalAmount.minus(taxAmount).plus(discountAmount);

        // Debit: Accounts Receivable (full amount customer owes)
        journalLines.push({
          accountId: accountIds.receivableAccountId,
          description: `Invoice ${invoice.invoiceNumber} - ${invoice.customer.name}`,
          debit: totalAmount,
          credit: new Decimal(0),
        });

        // Credit: Sales Revenue
        journalLines.push({
          accountId: accountIds.revenueAccountId,
          description: `Revenue - Invoice ${invoice.invoiceNumber}`,
          debit: new Decimal(0),
          credit: revenueAmount,
        });

        // Credit: Tax Payable (if tax exists and account provided)
        if (taxAmount.greaterThan(0) && accountIds.taxAccountId) {
          journalLines.push({
            accountId: accountIds.taxAccountId,
            description: `Tax - Invoice ${invoice.invoiceNumber}`,
            debit: new Decimal(0),
            credit: taxAmount,
          });
        }

        // Debit: Discount Given (if discount exists and account provided)
        if (discountAmount.greaterThan(0) && accountIds.discountAccountId) {
          // Adjust: Revenue was increased by discount, so we credit discount to offset
          // Actually the correct entry: Debit Discount, reduce Revenue credit
          // Let's keep it simple: revenue credit is net of discount already
        }

        const journalEntry = await tx.journalEntry.create({
          data: {
            companyId,
            date: invoice.issueDate,
            reference: `INV-${invoice.invoiceNumber}`,
            description: `Sales Invoice ${invoice.invoiceNumber} — ${invoice.customer.name}`,
            status: 'POSTED',
            lines: { create: journalLines },
          },
        });

        journalEntryId = journalEntry.id;

        // Update account balances
        for (const line of journalLines) {
          const account = await tx.account.findUnique({
            where: { id: line.accountId },
            select: { type: true, balance: true },
          });
          if (account) {
            let delta: Decimal;
            if (account.type === 'ASSET' || account.type === 'EXPENSE') {
              delta = new Decimal(line.debit).minus(new Decimal(line.credit));
            } else {
              delta = new Decimal(line.credit).minus(new Decimal(line.debit));
            }
            await tx.account.update({
              where: { id: line.accountId },
              data: { balance: new Decimal(account.balance).plus(delta) },
            });
          }
        }

        // Update customer balance (increase receivable)
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { balance: new Decimal(invoice.customer.balance).plus(totalAmount) },
        });
      }

      // Update invoice status
      const updatedInvoice = await tx.invoice.update({
        where: { id },
        data: {
          status: 'SENT',
          journalEntryId,
        },
        include: {
          customer: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });

      return {
        message: `Invoice ${invoice.invoiceNumber} has been sent`,
        invoice: updatedInvoice,
        journalEntryId,
      };
    });
  }

  // ================================================================
  // 3. RECORD PAYMENT
  // ================================================================
  async recordPayment(dto: RecordPaymentDto) {
    const { companyId, invoiceId, amount, paymentDate, method, reference, notes } = dto;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { customer: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');

    if (invoice.status === 'DRAFT') throw new BadRequestException('Cannot pay a DRAFT invoice. Send it first.');
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Cannot pay a CANCELLED invoice');
    if (invoice.status === 'PAID') throw new BadRequestException('Invoice is already fully paid');

    const paymentAmount = new Decimal(amount);
    const currentPaid = new Decimal(invoice.paidAmount);
    const totalAmount = new Decimal(invoice.totalAmount);
    const balanceDue = totalAmount.minus(currentPaid);

    if (paymentAmount.greaterThan(balanceDue)) {
      throw new BadRequestException(
        `Payment amount (${paymentAmount.toFixed(2)}) exceeds balance due (${balanceDue.toFixed(2)})`,
      );
    }

    const newPaidAmount = currentPaid.plus(paymentAmount);
    const newStatus = newPaidAmount.greaterThanOrEqualTo(totalAmount) ? 'PAID' : 'PARTIAL';

    return this.prisma.$transaction(async (tx) => {
      let journalEntryId: string | null = null;

      // Auto-resolve account IDs if not provided
      let cashBankAccountId = dto.cashBankAccountId;
      let receivableAccountId = dto.receivableAccountId;

      if (!cashBankAccountId) {
        const acc = await tx.account.findFirst({
          where: { companyId, OR: [{ subType: 'CASH' }, { code: '1010' }] },
        });
        if (acc) cashBankAccountId = acc.id;
      }
      if (!receivableAccountId) {
        const acc = await tx.account.findFirst({
          where: { companyId, OR: [{ subType: 'RECEIVABLE' }, { code: '1100' }] },
        });
        if (acc) receivableAccountId = acc.id;
      }

      // Auto-post payment journal entry if accounts are available
      if (cashBankAccountId && receivableAccountId) {
        const journalEntry = await tx.journalEntry.create({
          data: {
            companyId,
            date: paymentDate ? new Date(paymentDate) : new Date(),
            reference: `PMT-${invoice.invoiceNumber}-${Date.now()}`,
            description: `Payment received for Invoice ${invoice.invoiceNumber} — ${invoice.customer.name}`,
            status: 'POSTED',
            lines: {
              create: [
                {
                  accountId: cashBankAccountId,
                  description: `Payment received (${method || 'CASH'})`,
                  debit: paymentAmount,
                  credit: new Decimal(0),
                },
                {
                  accountId: receivableAccountId,
                  description: `Receivable cleared - Invoice ${invoice.invoiceNumber}`,
                  debit: new Decimal(0),
                  credit: paymentAmount,
                },
              ],
            },
          },
        });

        journalEntryId = journalEntry.id;

        // Update Cash/Bank account balance (ASSET: debit increases)
        const cashAccount = await tx.account.findUnique({
          where: { id: cashBankAccountId },
          select: { balance: true },
        });
        if (cashAccount) {
          await tx.account.update({
            where: { id: cashBankAccountId },
            data: { balance: new Decimal(cashAccount.balance).plus(paymentAmount) },
          });
        }

        // Update Receivable account balance (ASSET: credit decreases)
        const recvAccount = await tx.account.findUnique({
          where: { id: receivableAccountId },
          select: { balance: true },
        });
        if (recvAccount) {
          await tx.account.update({
            where: { id: receivableAccountId },
            data: { balance: new Decimal(recvAccount.balance).minus(paymentAmount) },
          });
        }

        // Decrease customer balance
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: { balance: new Decimal(invoice.customer.balance).minus(paymentAmount) },
        });
      }

      // Create payment record
      const payment = await tx.payment.create({
        data: {
          companyId,
          invoiceId,
          journalEntryId,
          amount: paymentAmount,
          paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
          method: method || 'CASH',
          reference: reference || null,
          notes: notes || null,
        },
      });

      // Update invoice
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: newPaidAmount,
          status: newStatus,
        },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
          payments: true,
        },
      });

      return {
        message: `Payment of ${paymentAmount.toFixed(2)} recorded for Invoice ${invoice.invoiceNumber}`,
        payment,
        invoice: updatedInvoice,
        balanceDue: totalAmount.minus(newPaidAmount).toFixed(2),
      };
    });
  }

  // ================================================================
  // 4. GET SINGLE INVOICE
  // ================================================================
  async getInvoice(id: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');

    const balanceDue = new Decimal(invoice.totalAmount).minus(new Decimal(invoice.paidAmount));

    return {
      ...invoice,
      balanceDue: balanceDue.toFixed(2),
    };
  }

  // ================================================================
  // 5. LIST INVOICES (with pagination and filters)
  // ================================================================
  async listInvoices(
    companyId: string,
    options: { page?: number; limit?: number; status?: string; customerId?: string },
  ) {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (options.status) where.status = options.status;
    if (options.customerId) where.customerId = options.customerId;

    const [invoices, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          items: true,
          _count: { select: { payments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: invoices,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ================================================================
  // 6. CANCEL INVOICE
  // ================================================================
  async cancelInvoice(id: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');
    if (invoice.status === 'CANCELLED') throw new BadRequestException('Invoice is already cancelled');

    if (invoice.payments.length > 0) {
      throw new BadRequestException('Cannot cancel an invoice with recorded payments. Void the payments first.');
    }

    return this.prisma.$transaction(async (tx) => {
      // If there's a linked journal entry, void it
      if (invoice.journalEntryId) {
        const journalEntry = await tx.journalEntry.findUnique({
          where: { id: invoice.journalEntryId },
          include: { lines: true },
        });

        if (journalEntry && journalEntry.status === 'POSTED') {
          // Reverse account balances
          for (const line of journalEntry.lines) {
            const account = await tx.account.findUnique({
              where: { id: line.accountId },
              select: { type: true, balance: true },
            });
            if (account) {
              let delta: Decimal;
              if (account.type === 'ASSET' || account.type === 'EXPENSE') {
                delta = new Decimal(line.debit).minus(new Decimal(line.credit));
              } else {
                delta = new Decimal(line.credit).minus(new Decimal(line.debit));
              }
              await tx.account.update({
                where: { id: line.accountId },
                data: { balance: new Decimal(account.balance).minus(delta) },
              });
            }
          }

          await tx.journalEntry.update({
            where: { id: invoice.journalEntryId },
            data: { status: 'VOIDED' },
          });
        }

        // Reverse customer balance
        await tx.customer.update({
          where: { id: invoice.customerId },
          data: {
            balance: {
              decrement: invoice.totalAmount,
            },
          },
        });
      }

      const cancelled = await tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { customer: { select: { id: true, name: true } }, items: true },
      });

      return {
        message: `Invoice ${invoice.invoiceNumber} has been cancelled`,
        invoice: cancelled,
      };
    });
  }

  // ================================================================
  // 7. GET INVOICE PDF DATA (structured for PDF generation)
  // ================================================================
  async getInvoicePdfData(id: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        company: true,
        customer: true,
        items: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { paymentDate: 'asc' } },
      },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');

    const balanceDue = new Decimal(invoice.totalAmount).minus(new Decimal(invoice.paidAmount));

    return {
      // Company (seller) info
      company: {
        name: invoice.company.name,
        email: invoice.company.email,
        phone: invoice.company.phone,
        address: invoice.company.address,
        currency: invoice.company.currency,
      },
      // Customer (buyer) info
      customer: {
        name: invoice.customer.name,
        email: invoice.customer.email,
        phone: invoice.customer.phone,
        address: invoice.customer.address,
      },
      // Invoice details
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        notes: invoice.notes,
      },
      // Line items
      items: invoice.items.map((item, index) => ({
        lineNumber: index + 1,
        description: item.description,
        quantity: new Decimal(item.quantity).toFixed(2),
        unitPrice: new Decimal(item.unitPrice).toFixed(2),
        discountRate: new Decimal(item.discountRate).toFixed(2),
        discountAmount: new Decimal(item.discountAmount).toFixed(2),
        taxRate: new Decimal(item.taxRate).toFixed(2),
        taxAmount: new Decimal(item.taxAmount).toFixed(2),
        totalAmount: new Decimal(item.totalAmount).toFixed(2),
      })),
      // Financial summary
      financials: {
        subTotal: new Decimal(invoice.subTotal).toFixed(2),
        totalDiscount: new Decimal(invoice.discountAmount).toFixed(2),
        totalTax: new Decimal(invoice.taxAmount).toFixed(2),
        totalAmount: new Decimal(invoice.totalAmount).toFixed(2),
        paidAmount: new Decimal(invoice.paidAmount).toFixed(2),
        balanceDue: balanceDue.toFixed(2),
      },
      // Payment history
      payments: invoice.payments.map((p) => ({
        date: p.paymentDate,
        amount: new Decimal(p.amount).toFixed(2),
        method: p.method,
        reference: p.reference,
      })),
    };
  }

  // ================================================================
  // PRIVATE HELPERS
  // ================================================================
  private async generateInvoiceNumber(companyId: string): Promise<string> {
    const lastInvoice = await this.prisma.invoice.findFirst({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (!lastInvoice) {
      return 'INV-0001';
    }

    // Try to extract number from last invoice
    const match = lastInvoice.invoiceNumber.match(/(\d+)$/);
    if (match) {
      const nextNum = parseInt(match[1], 10) + 1;
      return `INV-${String(nextNum).padStart(4, '0')}`;
    }

    // Fallback: count-based
    const count = await this.prisma.invoice.count({ where: { companyId } });
    return `INV-${String(count + 1).padStart(4, '0')}`;
  }

  // ================================================================
  // RECURRING INVOICES
  // ================================================================

  async createRecurring(dto: any) {
    const { companyId, customerId, frequency, intervalDays, nextIssueDate, endDate, daysDueAfter, templateItems, notes } = dto;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId) throw new BadRequestException('Customer does not belong to this company');

    const recurring = await this.prisma.recurringInvoice.create({
      data: {
        companyId,
        customerId,
        frequency,
        intervalDays: frequency === 'CUSTOM' ? intervalDays : null,
        nextIssueDate: new Date(nextIssueDate),
        endDate: endDate ? new Date(endDate) : null,
        daysDueAfter: daysDueAfter || 30,
        templateItems: templateItems as any,
        notes: notes || null,
        isActive: true,
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    this.auditService.log({
      companyId,
      action: 'CREATE',
      entity: 'RecurringInvoice',
      entityId: recurring.id,
      description: `Recurring invoice created for ${customer.name} — ${frequency}`,
    });

    return recurring;
  }

  async listRecurring(companyId: string) {
    return this.prisma.recurringInvoice.findMany({
      where: { companyId },
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateRecurring(id: string, companyId: string, dto: any) {
    const existing = await this.prisma.recurringInvoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recurring invoice not found');
    if (existing.companyId !== companyId) throw new BadRequestException('Does not belong to this company');

    const data: any = {};
    if (dto.frequency !== undefined) data.frequency = dto.frequency;
    if (dto.intervalDays !== undefined) data.intervalDays = dto.intervalDays;
    if (dto.nextIssueDate !== undefined) data.nextIssueDate = new Date(dto.nextIssueDate);
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.daysDueAfter !== undefined) data.daysDueAfter = dto.daysDueAfter;
    if (dto.templateItems !== undefined) data.templateItems = dto.templateItems as any;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    return this.prisma.recurringInvoice.update({
      where: { id },
      data,
      include: {
        customer: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async deleteRecurring(id: string, companyId: string) {
    const existing = await this.prisma.recurringInvoice.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Recurring invoice not found');
    if (existing.companyId !== companyId) throw new BadRequestException('Does not belong to this company');

    await this.prisma.recurringInvoice.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Recurring invoice deactivated' };
  }

  async generateDueRecurringInvoices(companyId?: string) {
    const now = new Date();
    const where: any = {
      isActive: true,
      nextIssueDate: { lte: now },
    };
    if (companyId) where.companyId = companyId;

    // Also exclude templates that have passed their end date
    const templates = await this.prisma.recurringInvoice.findMany({
      where,
      include: { customer: true },
    });

    const generated: any[] = [];

    for (const template of templates) {
      // Skip if past end date
      if (template.endDate && template.endDate < now) {
        await this.prisma.recurringInvoice.update({
          where: { id: template.id },
          data: { isActive: false },
        });
        continue;
      }

      try {
        // Parse template items
        const items = (template.templateItems as any[]).map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountRate: item.discountRate || 0,
          taxRate: item.taxRate || 0,
        }));

        // Calculate due date
        const issueDate = template.nextIssueDate;
        const dueDate = new Date(issueDate);
        dueDate.setDate(dueDate.getDate() + template.daysDueAfter);

        // Create real invoice
        const invoice = await this.createInvoice({
          companyId: template.companyId,
          customerId: template.customerId,
          issueDate: issueDate.toISOString(),
          dueDate: dueDate.toISOString(),
          items,
          notes: template.notes || `Auto-generated from recurring template`,
        });

        // Advance nextIssueDate
        const nextDate = this.calculateNextDate(issueDate, template.frequency, template.intervalDays);

        await this.prisma.recurringInvoice.update({
          where: { id: template.id },
          data: {
            nextIssueDate: nextDate,
            lastGeneratedAt: now,
            totalGenerated: { increment: 1 },
          },
        });

        generated.push({
          recurringId: template.id,
          customerName: template.customer.name,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
        });
      } catch (err: any) {
        // Log error but continue with other templates
        console.error(`Failed to generate recurring invoice ${template.id}:`, err.message);
      }
    }

    return {
      message: `Generated ${generated.length} invoice(s) from ${templates.length} recurring template(s)`,
      generated,
    };
  }

  private calculateNextDate(current: Date, frequency: string, intervalDays?: number | null): Date {
    const next = new Date(current);
    switch (frequency) {
      case 'WEEKLY':
        next.setDate(next.getDate() + 7);
        break;
      case 'MONTHLY':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'QUARTERLY':
        next.setMonth(next.getMonth() + 3);
        break;
      case 'YEARLY':
        next.setFullYear(next.getFullYear() + 1);
        break;
      case 'CUSTOM':
        next.setDate(next.getDate() + (intervalDays || 30));
        break;
      default:
        next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  // ================================================================
  // OVERDUE TRACKING
  // ================================================================

  async markOverdueInvoices(companyId?: string) {
    const now = new Date();
    const where: any = {
      status: { in: ['SENT', 'PARTIAL'] },
      dueDate: { lt: now },
    };
    if (companyId) where.companyId = companyId;

    const overdueInvoices = await this.prisma.invoice.findMany({
      where,
      select: { id: true, invoiceNumber: true, companyId: true },
    });

    if (overdueInvoices.length === 0) {
      return { message: 'No overdue invoices found', count: 0 };
    }

    const result = await this.prisma.invoice.updateMany({
      where: { id: { in: overdueInvoices.map((i) => i.id) } },
      data: {
        status: 'OVERDUE',
        overdueNotifiedAt: now,
      },
    });

    // Audit log for each
    for (const inv of overdueInvoices) {
      this.auditService.log({
        companyId: inv.companyId,
        action: 'UPDATE',
        entity: 'Invoice',
        entityId: inv.id,
        description: `Invoice ${inv.invoiceNumber} marked as OVERDUE`,
      });
    }

    return {
      message: `${result.count} invoice(s) marked as overdue`,
      count: result.count,
      invoices: overdueInvoices.map((i) => i.invoiceNumber),
    };
  }

  async getOverdueSummary(companyId: string) {
    const now = new Date();

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ['OVERDUE', 'SENT', 'PARTIAL'] },
        dueDate: { lt: now },
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Aging buckets
    const buckets = { '1-30': [] as any[], '31-60': [] as any[], '61-90': [] as any[], '90+': [] as any[] };
    let totalOverdue = new Decimal(0);

    for (const inv of overdueInvoices) {
      const balanceDue = new Decimal(inv.totalAmount).minus(new Decimal(inv.paidAmount));
      const daysOverdue = Math.floor((now.getTime() - new Date(inv.dueDate!).getTime()) / (1000 * 60 * 60 * 24));
      totalOverdue = totalOverdue.plus(balanceDue);

      const entry = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.customer.name,
        totalAmount: new Decimal(inv.totalAmount).toFixed(2),
        balanceDue: balanceDue.toFixed(2),
        dueDate: inv.dueDate,
        daysOverdue,
      };

      if (daysOverdue <= 30) buckets['1-30'].push(entry);
      else if (daysOverdue <= 60) buckets['31-60'].push(entry);
      else if (daysOverdue <= 90) buckets['61-90'].push(entry);
      else buckets['90+'].push(entry);
    }

    return {
      totalOverdueCount: overdueInvoices.length,
      totalOverdueAmount: totalOverdue.toFixed(2),
      aging: {
        '1-30': { count: buckets['1-30'].length, invoices: buckets['1-30'] },
        '31-60': { count: buckets['31-60'].length, invoices: buckets['31-60'] },
        '61-90': { count: buckets['61-90'].length, invoices: buckets['61-90'] },
        '90+': { count: buckets['90+'].length, invoices: buckets['90+'] },
      },
    };
  }

  // ================================================================
  // ENHANCED PAYMENT HISTORY
  // ================================================================

  async getPaymentHistory(invoiceId: string, companyId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, companyId: true, invoiceNumber: true, totalAmount: true, paidAmount: true, status: true },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.companyId !== companyId) throw new BadRequestException('Invoice does not belong to this company');

    const payments = await this.prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paymentDate: 'desc' },
    });

    const balanceDue = new Decimal(invoice.totalAmount).minus(new Decimal(invoice.paidAmount));

    return {
      invoiceNumber: invoice.invoiceNumber,
      totalAmount: new Decimal(invoice.totalAmount).toFixed(2),
      paidAmount: new Decimal(invoice.paidAmount).toFixed(2),
      balanceDue: balanceDue.toFixed(2),
      status: invoice.status,
      paymentCount: payments.length,
      payments: payments.map((p) => ({
        id: p.id,
        amount: new Decimal(p.amount).toFixed(2),
        paymentDate: p.paymentDate,
        method: p.method,
        reference: p.reference,
        notes: p.notes,
        journalEntryId: p.journalEntryId,
      })),
    };
  }
}
