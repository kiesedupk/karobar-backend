import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { UpdateTaxRateDto } from './dto/update-tax-rate.dto';

@Injectable()
export class TaxRatesService {
  constructor(private prisma: PrismaService) {}

  async create(createTaxRateDto: CreateTaxRateDto) {
    const existing = await this.prisma.taxRate.findUnique({
      where: {
        companyId_name: {
          companyId: createTaxRateDto.companyId,
          name: createTaxRateDto.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Tax rate with this name already exists in this company.');
    }

    return this.prisma.taxRate.create({
      data: createTaxRateDto,
    });
  }

  async findAll(companyId: string) {
    return this.prisma.taxRate.findMany({
      where: { companyId },
      orderBy: { rate: 'asc' },
    });
  }

  async findOne(id: string, companyId: string) {
    const taxRate = await this.prisma.taxRate.findFirst({
      where: { id, companyId },
    });
    if (!taxRate) {
      throw new NotFoundException('Tax rate not found');
    }
    return taxRate;
  }

  async update(id: string, companyId: string, updateTaxRateDto: UpdateTaxRateDto) {
    await this.findOne(id, companyId);

    if (updateTaxRateDto.name) {
      const existing = await this.prisma.taxRate.findFirst({
        where: {
          companyId,
          name: updateTaxRateDto.name,
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException('Tax rate with this name already exists.');
      }
    }

    return this.prisma.taxRate.update({
      where: { id },
      data: updateTaxRateDto,
    });
  }

  async remove(id: string, companyId: string) {
    await this.findOne(id, companyId);
    return this.prisma.taxRate.delete({
      where: { id },
    });
  }
}
