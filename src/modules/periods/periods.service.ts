import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { CreateFiscalYearDto, ClosePeriodDto } from './dto/periods.dto';

@Injectable()
export class PeriodsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  // ========================================
  // FISCAL YEAR MANAGEMENT
  // ========================================

  async createFiscalYear(dto: CreateFiscalYearDto) {
    const { companyId, name, startDate, endDate } = dto;
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end)
      throw new BadRequestException('Start date must be before end date');

    // Check for overlapping fiscal years
    const overlapping = await this.prisma.fiscalYear.findFirst({
      where: {
        companyId,
        OR: [
          { startDate: { lte: start }, endDate: { gte: start } },
          { startDate: { lte: end }, endDate: { gte: end } },
        ],
      },
    });

    if (overlapping)
      throw new ConflictException('Fiscal year overlaps with an existing one');

    return this.prisma.$transaction(async (tx) => {
      const fiscalYear = await tx.fiscalYear.create({
        data: { companyId, name, startDate: start, endDate: end },
      });

      // Automatically generate monthly periods
      const periods = [];
      const current = new Date(start);
      while (current < end) {
        const periodStart = new Date(current);
        const periodEnd = new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          0,
          23,
          59,
          59,
        );

        periods.push({
          companyId,
          fiscalYearId: fiscalYear.id,
          name: periodStart.toLocaleString('default', {
            month: 'long',
            year: 'numeric',
          }),
          startDate: periodStart,
          endDate: periodEnd > end ? end : periodEnd,
        });

        current.setMonth(current.getMonth() + 1);
      }

      await tx.accountingPeriod.createMany({ data: periods });

      this.auditService.log({
        companyId,
        action: 'CREATE',
        entity: 'FiscalYear',
        entityId: fiscalYear.id,
        description: `Fiscal year "${name}" created with ${periods.length} monthly periods.`,
      });

      return fiscalYear;
    });
  }

  async listFiscalYears(companyId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { companyId },
      include: { _count: { select: { periods: true } } },
      orderBy: { startDate: 'desc' },
    });
  }

  // ========================================
  // PERIOD MANAGEMENT
  // ========================================

  async listPeriods(companyId: string, fiscalYearId?: string) {
    const where: any = { companyId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;

    return this.prisma.accountingPeriod.findMany({
      where,
      orderBy: { startDate: 'asc' },
    });
  }

  async closePeriod(dto: ClosePeriodDto, userId: string) {
    const { companyId, periodId } = dto;

    const period = await this.prisma.accountingPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) throw new NotFoundException('Period not found');
    if (period.companyId !== companyId)
      throw new BadRequestException('Unauthorized');
    if (period.isClosed)
      throw new BadRequestException('Period is already closed');

    // Check if there are any DRAFT journal entries in this period
    const draftEntries = await this.prisma.journalEntry.count({
      where: {
        companyId,
        status: 'DRAFT',
        date: { gte: period.startDate, lte: period.endDate },
      },
    });

    if (draftEntries > 0) {
      throw new BadRequestException(
        `Cannot close period. There are ${draftEntries} draft journal entries that must be posted or deleted.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountingPeriod.update({
        where: { id: periodId },
        data: {
          isClosed: true,
          status: 'CLOSED',
          closedAt: new Date(),
          closedBy: userId,
        },
      });

      this.auditService.log({
        companyId,
        userId,
        action: 'UPDATE',
        entity: 'AccountingPeriod',
        entityId: periodId,
        description: `Accounting period "${period.name}" closed and locked.`,
      });

      return updated;
    });
  }

  // ========================================
  // LOCK CHECK LOGIC (Crucial for other services)
  // ========================================

  /**
   * Checks if a specific date is within a closed accounting period.
   * Throws BadRequestException if locked.
   */
  async checkLock(companyId: string, date: Date | string) {
    const checkDate = new Date(date);

    const closedPeriod = await this.prisma.accountingPeriod.findFirst({
      where: {
        companyId,
        isClosed: true,
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
    });

    if (closedPeriod) {
      throw new BadRequestException(
        `Transaction failed. The date ${checkDate.toLocaleDateString()} falls within the closed accounting period "${closedPeriod.name}".`,
      );
    }

    return true;
  }

  /**
   * Helper for bulk checks or simple boolean checks
   */
  async isDateLocked(companyId: string, date: Date | string): Promise<boolean> {
    const checkDate = new Date(date);
    const count = await this.prisma.accountingPeriod.count({
      where: {
        companyId,
        isClosed: true,
        startDate: { lte: checkDate },
        endDate: { gte: checkDate },
      },
    });
    return count > 0;
  }
}
