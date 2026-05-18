import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { Decimal } from '@prisma/client/runtime/library';
import { AuditService } from '../../common/audit/audit.service';
import { PeriodsService } from '../periods/periods.service';

@Injectable()
export class QuotationsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private periodsService: PeriodsService,
  ) {}

  private async generateQuotationNumber(companyId: string): Promise<string> {
    const today = new Date();
    const prefix = `QT-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}`;
    const count = await this.prisma.quotation.count({
      where: {
        companyId,
        quotationNumber: { startsWith: prefix },
      },
    });
    return `${prefix}-${(count + 1).toString().padStart(4, '0')}`;
  }

  async create(dto: CreateQuotationDto) {
    const { companyId, customerId, items, notes, globalDiscountAmount, issueDate, expiryDate } = dto;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found');

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.companyId !== companyId) throw new BadRequestException('Customer does not belong to this company');

    const quotationNumber = dto.quotationNumber || (await this.generateQuotationNumber(companyId));

    const existing = await this.prisma.quotation.findUnique({
      where: { companyId_quotationNumber: { companyId, quotationNumber } },
    });
    if (existing) throw new ConflictException(`Quotation number "${quotationNumber}" already exists`);

    const calculatedItems = items.map((item) => {
      const lineSubTotal = new Decimal(item.quantity).mul(new Decimal(item.unitPrice));
      const discountRate = new Decimal(item.discountRate || 0);
      const discountAmount = lineSubTotal.mul(discountRate).div(100);
      const afterDiscount = lineSubTotal.minus(discountAmount);
      const taxRate = new Decimal(item.taxRate || 0);
      const taxAmount = afterDiscount.mul(taxRate).div(100);
      const totalAmount = afterDiscount.plus(taxAmount);

      return {
        productId: item.productId || null,
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

    const quotation = await this.prisma.quotation.create({
      data: {
        companyId,
        customerId,
        quotationNumber,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        subTotal,
        discountAmount: totalDiscount,
        taxAmount: totalTax,
        totalAmount,
        status: 'DRAFT',
        notes: notes || null,
        items: {
          create: calculatedItems,
        },
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
    });

    this.auditService.log({
      companyId,
      action: 'CREATE',
      entity: 'Quotation',
      entityId: quotation.id,
      description: `Quotation ${quotationNumber} created for ${customer.name}`,
    });

    return quotation;
  }

  async findAll(companyId: string) {
    return this.prisma.quotation.findMany({
      where: { companyId },
      include: { customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { include: { product: true } },
      },
    });
    if (!quotation || quotation.companyId !== companyId) {
      throw new NotFoundException('Quotation not found');
    }
    return quotation;
  }

  async updateStatus(companyId: string, id: string, status: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation || quotation.companyId !== companyId) throw new NotFoundException('Quotation not found');

    const updated = await this.prisma.quotation.update({
      where: { id },
      data: { status },
    });

    this.auditService.log({
      companyId,
      action: 'UPDATE',
      entity: 'Quotation',
      entityId: id,
      description: `Quotation ${quotation.quotationNumber} status changed to ${status}`,
    });

    return updated;
  }

  async delete(companyId: string, id: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation || quotation.companyId !== companyId) throw new NotFoundException('Quotation not found');

    await this.prisma.quotation.delete({ where: { id } });

    this.auditService.log({
      companyId,
      action: 'DELETE',
      entity: 'Quotation',
      entityId: id,
      description: `Quotation ${quotation.quotationNumber} deleted`,
    });

    return { message: 'Quotation deleted successfully' };
  }

  async convertToInvoice(companyId: string, id: string, body: any) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation || quotation.companyId !== companyId) throw new NotFoundException('Quotation not found');

    if (quotation.status === 'ACCEPTED' || quotation.status === 'REJECTED') {
      // It's already converted or rejected, but we might allow it anyway. For safety, allow DRAFT or SENT
    }

    // Mark quotation as ACCEPTED
    await this.updateStatus(companyId, id, 'ACCEPTED');

    return {
      message: 'Conversion prepared',
      quotation,
      // The frontend will take this quotation and pre-fill the Invoice form, 
      // then submit it to the standard Invoice POST endpoint.
      // This is a simpler and more robust approach than recreating all accounting logic here.
    };
  }
}
