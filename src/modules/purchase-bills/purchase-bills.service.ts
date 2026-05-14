import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreatePurchaseBillDto } from './dto/create-purchase-bill.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class PurchaseBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreatePurchaseBillDto) {
    const {
      companyId,
      vendorId,
      warehouseId,
      billNumber,
      paymentAccountId,
      items,
    } = dto;

    // 1. Validate company
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) throw new NotFoundException('Company not found');

    // 2. Validate warehouse
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
    });
    if (!warehouse || warehouse.companyId !== companyId)
      throw new BadRequestException('Invalid warehouse');

    // 3. Validate payment account (Cash/Bank - ASSET type)
    const paymentAccount = await this.prisma.account.findUnique({
      where: { id: paymentAccountId },
    });
    if (!paymentAccount || paymentAccount.companyId !== companyId)
      throw new BadRequestException('Invalid payment account');
    if (
      paymentAccount.type !== 'ASSET' &&
      paymentAccount.type !== 'LIABILITY'
    ) {
      throw new BadRequestException(
        'Payment account must be ASSET or LIABILITY type',
      );
    }

    // 4. Validate unique bill number
    const existingBill = await this.prisma.purchaseBill.findUnique({
      where: { companyId_billNumber: { companyId, billNumber } },
    });
    if (existingBill) throw new ConflictException('Bill number already exists');

    // 5. Validate vendor
    if (vendorId) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
      });
      if (!vendor || vendor.companyId !== companyId)
        throw new BadRequestException('Invalid vendor');
    }

    // 6. Validate products and calculate totals
    let subTotal = new Decimal(0);
    let totalTax = new Decimal(0);
    const processedItems: any[] = [];

    for (const item of items) {
      const product = await this.prisma.product.findFirst({
        where: { id: item.productId, companyId },
      });
      if (!product)
        throw new BadRequestException(`Product not found: ${item.productId}`);

      const lineTotal = new Decimal(item.unitCost).mul(item.quantity);
      const taxRate = new Decimal(item.taxRate || 0);
      const lineTax = lineTotal.mul(taxRate).div(100);
      const lineGross = lineTotal.plus(lineTax);

      subTotal = subTotal.plus(lineTotal);
      totalTax = totalTax.plus(lineTax);

      processedItems.push({
        productId: item.productId,
        description: item.description || product.name,
        quantity: new Decimal(item.quantity),
        unitCost: new Decimal(item.unitCost),
        taxRate,
        taxAmount: lineTax,
        totalAmount: lineGross,
        product,
      });
    }

    const totalAmount = subTotal.plus(totalTax);

    // === ATOMIC TRANSACTION ===
    return this.prisma.$transaction(async (tx) => {
      // A. Create Journal Entry (Dr: Inventory Asset, Cr: Cash/Bank)
      const journalLines: any[] = [];

      // Group inventory debits by product's asset account
      const assetDebits = new Map<string, Decimal>();
      for (const item of processedItems) {
        const assetAccountId = item.product.assetAccountId;
        if (assetAccountId) {
          const current = assetDebits.get(assetAccountId) || new Decimal(0);
          assetDebits.set(assetAccountId, current.plus(item.totalAmount));
        }
      }

      // If products have asset accounts, use them; otherwise use a generic debit
      if (assetDebits.size > 0) {
        for (const [accountId, amount] of assetDebits) {
          journalLines.push({
            accountId,
            description: `Purchase inventory: Bill #${billNumber}`,
            debit: amount,
            credit: new Decimal(0),
          });
        }
      } else {
        // Fallback: look for any ASSET account with subType INVENTORY
        const invAccount = await tx.account.findFirst({
          where: { companyId, type: 'ASSET', subType: 'INVENTORY' },
        });
        if (invAccount) {
          journalLines.push({
            accountId: invAccount.id,
            description: `Purchase inventory: Bill #${billNumber}`,
            debit: totalAmount,
            credit: new Decimal(0),
          });
        }
      }

      // Credit: Payment account
      journalLines.push({
        accountId: paymentAccountId,
        description: `Payment for purchase bill #${billNumber}`,
        debit: new Decimal(0),
        credit: totalAmount,
      });

      const journalEntry = await tx.journalEntry.create({
        data: {
          companyId,
          date: dto.billDate ? new Date(dto.billDate) : new Date(),
          reference: `PB-${billNumber}`,
          description: `Auto-posted: Purchase Bill #${billNumber}`,
          status: 'POSTED',
          lines: { create: journalLines },
        },
        include: { lines: true },
      });

      // B. Update GL account balances
      for (const line of journalEntry.lines) {
        const account = await tx.account.findUnique({
          where: { id: line.accountId },
        });
        if (account) {
          let delta: Decimal;
          if (account.type === 'ASSET' || account.type === 'EXPENSE') {
            delta = new Decimal(line.debit).minus(new Decimal(line.credit));
          } else {
            delta = new Decimal(line.credit).minus(new Decimal(line.debit));
          }
          await tx.account.update({
            where: { id: account.id },
            data: { balance: new Decimal(account.balance).plus(delta) },
          });
        }
      }

      // C. Create the Purchase Bill record
      const bill = await tx.purchaseBill.create({
        data: {
          companyId,
          vendorId: vendorId || null,
          warehouseId,
          journalEntryId: journalEntry.id,
          billNumber,
          billDate: dto.billDate ? new Date(dto.billDate) : new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          subTotal,
          taxAmount: totalTax,
          totalAmount,
          paidAmount: totalAmount,
          status: 'RECEIVED',
          notes: dto.notes,
          items: {
            create: processedItems.map((pi) => ({
              productId: pi.productId,
              description: pi.description,
              quantity: pi.quantity,
              unitCost: pi.unitCost,
              taxRate: pi.taxRate,
              taxAmount: pi.taxAmount,
              totalAmount: pi.totalAmount,
            })),
          },
        },
        include: { items: true },
      });

      // D. Update inventory — stock in for each product
      for (const item of processedItems) {
        // D1. Upsert WarehouseStock
        const existingStock = await tx.warehouseStock.findUnique({
          where: {
            warehouseId_productId: { warehouseId, productId: item.productId },
          },
        });

        const previousQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = previousQty + Number(item.quantity);

        if (existingStock) {
          await tx.warehouseStock.update({
            where: { id: existingStock.id },
            data: { quantity: newQty },
          });
        } else {
          await tx.warehouseStock.create({
            data: {
              companyId,
              warehouseId,
              productId: item.productId,
              quantity: Number(item.quantity),
            },
          });
        }

        // D2. Update Product.currentStock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: Number(item.quantity) },
            costPrice: item.unitCost, // Update latest cost price
          },
        });

        // D3. Record StockTransaction
        await tx.stockTransaction.create({
          data: {
            companyId,
            warehouseId,
            productId: item.productId,
            type: 'STOCK_IN',
            quantity: Number(item.quantity),
            previousQty,
            newQty,
            reference: `PB-${billNumber}`,
            sourceType: 'PURCHASE',
            sourceId: bill.id,
            notes: `Purchase Bill #${billNumber}`,
          },
        });

        // D4. Create FIFO Layer
        await tx.inventoryFifoLayer.create({
          data: {
            companyId,
            warehouseId,
            productId: item.productId,
            unitCost: new Decimal(item.unitCost),
            originalQty: new Decimal(item.quantity),
            remainingQty: new Decimal(item.quantity),
            sourceType: 'PURCHASE',
            sourceId: bill.id,
          },
        });
      }

      // E. Audit Log
      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'PurchaseBill',
        entityId: bill.id,
        description: `Purchase Bill #${billNumber} — Rs ${totalAmount} — ${items.length} items → ${warehouse.name}`,
      });

      return bill;
    });
  }

  async findAll(companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.purchaseBill.findMany({
        where: { companyId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vendor: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true } },
            },
          },
        },
      }),
      this.prisma.purchaseBill.count({ where: { companyId } }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(companyId: string, id: string) {
    const bill = await this.prisma.purchaseBill.findUnique({
      where: { id },
      include: {
        vendor: true,
        items: { include: { product: true } },
      },
    });
    if (!bill || bill.companyId !== companyId)
      throw new NotFoundException('Purchase bill not found');
    return bill;
  }
}
