import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVoucherDto } from './dto/create-voucher.dto';
import { UpdateVoucherDto } from './dto/update-voucher.dto';

@Injectable()
export class VouchersService {
  constructor(private prisma: PrismaService) {}

  async create(createVoucherDto: CreateVoucherDto) {
    return this.prisma.$transaction(async (tx: any) => {
      // Create voucher
      const voucher = await tx.voucher.create({
        data: {
          companyId: createVoucherDto.companyId,
          voucherNumber: createVoucherDto.voucherNumber,
          type: createVoucherDto.type,
          date: new Date(createVoucherDto.date),
          contactType: createVoucherDto.contactType,
          contactId: createVoucherDto.contactId,
          accountId: createVoucherDto.accountId,
          amount: createVoucherDto.amount,
          reference: createVoucherDto.reference,
          description: createVoucherDto.description,
          status: 'POSTED',
        },
      });

      // Get the payment/receipt account
      const paymentAccount = await tx.account.findFirst({
        where: { id: createVoucherDto.accountId, companyId: createVoucherDto.companyId },
      });
      if (!paymentAccount) throw new NotFoundException('Payment Account not found');

      // Create Journal Entry
      let oppositeAccountCode = '';
      if (createVoucherDto.type === 'RECEIPT') {
        // Customer advance (Receipt) -> affects Accounts Receivable
        oppositeAccountCode = '1100'; // Accounts Receivable
      } else {
        // Vendor advance (Payment) -> affects Accounts Payable
        oppositeAccountCode = '2010'; // Accounts Payable
      }

      const oppositeAccount = await tx.account.findFirst({
        where: { companyId: createVoucherDto.companyId, code: oppositeAccountCode },
      });
      if (!oppositeAccount) throw new NotFoundException(`Opposite account (${oppositeAccountCode}) not found for double entry`);

      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId: createVoucherDto.companyId,
          date: new Date(createVoucherDto.date),
          reference: voucher.voucherNumber,
          description: createVoucherDto.description,
          status: 'POSTED',
        },
      });

      const lines = [];
      if (createVoucherDto.type === 'RECEIPT') {
        // Receipt: Debit Bank, Credit AR
        lines.push({ journalEntryId: journalEntry.id, accountId: paymentAccount.id, debit: createVoucherDto.amount, credit: 0, description: createVoucherDto.description });
        lines.push({ journalEntryId: journalEntry.id, accountId: oppositeAccount.id, debit: 0, credit: createVoucherDto.amount, description: createVoucherDto.description });
      } else {
        // Payment: Credit Bank, Debit AP
        lines.push({ journalEntryId: journalEntry.id, accountId: paymentAccount.id, debit: 0, credit: createVoucherDto.amount, description: createVoucherDto.description });
        lines.push({ journalEntryId: journalEntry.id, accountId: oppositeAccount.id, debit: createVoucherDto.amount, credit: 0, description: createVoucherDto.description });
      }

      await tx.journalLine.createMany({ data: lines });

      // Update Voucher with Journal Entry ID
      const updatedVoucher = await tx.voucher.update({
        where: { id: voucher.id },
        data: { journalEntryId: journalEntry.id },
      });

      // Update Customer/Vendor Balances
      if (createVoucherDto.contactType === 'CUSTOMER' && createVoucherDto.contactId) {
        const customer = await tx.customer.findUnique({ where: { id: createVoucherDto.contactId } });
        if (customer) {
          // Receipt decreases balance (balance = what they owe us)
          const newBalance = Number(customer.balance) - createVoucherDto.amount;
          await tx.customer.update({ where: { id: customer.id }, data: { balance: newBalance } });
        }
      } else if (createVoucherDto.contactType === 'VENDOR' && createVoucherDto.contactId) {
        const vendor = await tx.vendor.findUnique({ where: { id: createVoucherDto.contactId } });
        if (vendor) {
          // Payment decreases balance (balance = what we owe them)
          const newBalance = Number(vendor.balance) - createVoucherDto.amount;
          await tx.vendor.update({ where: { id: vendor.id }, data: { balance: newBalance } });
        }
      }

      return updatedVoucher;
    });
  }

  async findAll(companyId: string, type?: string) {
    const where: any = { companyId };
    if (type) where.type = type;

    return this.prisma.voucher.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        account: { select: { name: true } },
      }
    });
  }

  async findOne(id: string, companyId: string) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id, companyId },
      include: {
        account: { select: { name: true } }
      }
    });
    if (!voucher) throw new NotFoundException('Voucher not found');
    
    // Fetch contact details manually since it's a polymorphic relation
    let contactName = null;
    if (voucher.contactType === 'CUSTOMER' && voucher.contactId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: voucher.contactId }});
      contactName = customer?.name;
    } else if (voucher.contactType === 'VENDOR' && voucher.contactId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: voucher.contactId }});
      contactName = vendor?.name;
    }

    return { ...voucher, contactName };
  }

  // Update and Remove are complex due to accounting and balance reversal. We'll implement basic delete only if needed or just prevent it.
  async remove(id: string, companyId: string) {
    throw new BadRequestException('Vouchers cannot be deleted. Please post a reverse entry or use cancellation (not implemented yet).');
  }
}
