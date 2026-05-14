import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';

@Injectable()
export class UnitsOfMeasureService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateUnitDto) {
    const existing = await this.prisma.unitOfMeasure.findFirst({
      where: { companyId, OR: [{ name: dto.name }, { symbol: dto.symbol }] },
    });
    if (existing) {
      throw new ConflictException(
        'Unit with this name or symbol already exists',
      );
    }
    return this.prisma.unitOfMeasure.create({
      data: { ...dto, companyId },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.unitOfMeasure.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(companyId: string, id: string) {
    const unit = await this.prisma.unitOfMeasure.findUnique({
      where: { id, companyId },
    });
    if (!unit) throw new NotFoundException('Unit of measure not found');
    return unit;
  }

  async update(companyId: string, id: string, dto: UpdateUnitDto) {
    await this.findOne(companyId, id); // Verify existence
    return this.prisma.unitOfMeasure.update({
      where: { id, companyId },
      data: dto,
    });
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    return this.prisma.unitOfMeasure.delete({
      where: { id, companyId },
    });
  }
}
