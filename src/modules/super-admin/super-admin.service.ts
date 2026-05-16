import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  // ── 1. Stats ──────────────────────────────────────────────────────────
  async getStats() {
    const [total, active, trial, suspended, expired] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.company.count({ where: { subscriptionStatus: 'ACTIVE', plan: { not: 'TRIAL' } } }),
      this.prisma.company.count({ where: { plan: 'TRIAL', subscriptionStatus: 'ACTIVE' } }),
      this.prisma.company.count({ where: { subscriptionStatus: 'SUSPENDED' } }),
      this.prisma.company.count({ where: { subscriptionStatus: 'EXPIRED' } }),
    ]);

    const totalUsers = await this.prisma.user.count({ where: { isSuperAdmin: false } });
    const recentCompanies = await this.prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, plan: true, subscriptionStatus: true, createdAt: true },
    });

    return { total, active, trial, suspended, expired, totalUsers, recentCompanies };
  }

  // ── 2. List all companies ─────────────────────────────────────────────
  async getAllCompanies(search?: string) {
    const companies = await this.prisma.company.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        users: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        _count: { select: { products: true, invoices: true, posSessions: true } },
      },
    });

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      plan: c.plan,
      subscriptionStatus: c.subscriptionStatus,
      trialEndsAt: c.trialEndsAt,
      suspendedReason: c.suspendedReason,
      adminNotes: c.adminNotes,
      createdAt: c.createdAt,
      userCount: c.users.length,
      owner: c.users[0]?.user ?? null,
      stats: {
        products: c._count.products,
        invoices: c._count.invoices,
        sessions: c._count.posSessions,
      },
    }));
  }

  // ── 3. Single company detail ──────────────────────────────────────────
  async getCompany(id: string) {
    return this.prisma.company.findUnique({
      where: { id },
      include: {
        users: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true, createdAt: true } },
            role: { select: { name: true } },
          },
        },
        _count: { select: { products: true, invoices: true, posSessions: true, accounts: true } },
      },
    });
  }

  // ── 4. Extend trial ───────────────────────────────────────────────────
  async extendTrial(id: string, days: number) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    const currentEnd = company?.trialEndsAt ?? new Date();
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + days);

    return this.prisma.company.update({
      where: { id },
      data: {
        trialEndsAt: newEnd,
        subscriptionStatus: 'ACTIVE',
        plan: 'TRIAL',
      },
    });
  }

  // ── 5. Suspend company ────────────────────────────────────────────────
  async suspendCompany(id: string, reason: string) {
    return this.prisma.company.update({
      where: { id },
      data: { subscriptionStatus: 'SUSPENDED', suspendedReason: reason },
    });
  }

  // ── 6. Activate company ───────────────────────────────────────────────
  async activateCompany(id: string) {
    return this.prisma.company.update({
      where: { id },
      data: { subscriptionStatus: 'ACTIVE', suspendedReason: null },
    });
  }

  // ── 7. Change plan ────────────────────────────────────────────────────
  async changePlan(id: string, plan: string) {
    return this.prisma.company.update({
      where: { id },
      data: { plan, subscriptionStatus: 'ACTIVE', trialEndsAt: null },
    });
  }

  // ── 8. Update admin notes ─────────────────────────────────────────────
  async updateNotes(id: string, notes: string) {
    return this.prisma.company.update({
      where: { id },
      data: { adminNotes: notes },
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 2 — NEW FEATURES
  // ══════════════════════════════════════════════════════════════════════

  // ── #1. Delete company ─────────────────────────────────────────────────
  async deleteCompany(id: string) {
    // Delete all related data in correct FK order using raw SQL
    await this.prisma.$executeRawUnsafe(`DELETE FROM "JournalLine" WHERE "journalEntryId" IN (SELECT id FROM "JournalEntry" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "JournalEntry" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "InvoiceItem" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Payment" WHERE "invoiceId" IN (SELECT id FROM "Invoice" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Invoice" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Expense" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "StockAdjustmentItem" WHERE "adjustmentId" IN (SELECT id FROM "StockAdjustment" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "StockAdjustment" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "StockTakeItem" WHERE "stockTakeId" IN (SELECT id FROM "StockTake" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "StockTake" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "WarehouseTransferItem" WHERE "transferId" IN (SELECT id FROM "WarehouseTransfer" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "WarehouseTransfer" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "PurchaseBillItem" WHERE "billId" IN (SELECT id FROM "PurchaseBill" WHERE "companyId" = '${id}')`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "PurchaseBill" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "StockTransaction" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "WarehouseStock" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "PosHeldCart" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "PosSession" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Product" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "ProductCategory" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "UnitOfMeasure" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Account" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Customer" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Vendor" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "BankAccount" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "AccountingPeriod" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Warehouse" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "UserCompany" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Role" WHERE "companyId" = '${id}'`);
    await this.prisma.$executeRawUnsafe(`DELETE FROM "Company" WHERE "id" = '${id}'`);

    return { message: 'Company deleted successfully' };
  }

  // ── #2. Toggle user active/inactive ────────────────────────────────────
  async toggleUserActive(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
    });
  }

  // ── #3. Reset user password ────────────────────────────────────────────
  async resetUserPassword(userId: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
    return { message: 'Password reset successfully' };
  }

  // ── #4. Auto Trial Expiry (runs daily at midnight) ─────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async expireTrials() {
    const result = await this.prisma.company.updateMany({
      where: {
        plan: 'TRIAL',
        subscriptionStatus: 'ACTIVE',
        trialEndsAt: { lt: new Date() },
      },
      data: {
        subscriptionStatus: 'EXPIRED',
        suspendedReason: 'ٹرائل کی مدت ختم ہو گئی ہے۔ سروس جاری رکھنے کے لیے پیڈ پلان خریدیں۔',
      },
    });
    if (result.count > 0) {
      console.log(`[CRON] Expired ${result.count} trial companies`);
    }
    return result;
  }

  // ── #5. Login as Company (Impersonation) ───────────────────────────────
  async loginAsCompany(companyId: string, superAdminId: string) {
    // Find the company's admin user
    const companyUser = await this.prisma.userCompany.findFirst({
      where: { companyId },
      include: {
        user: true,
        role: true,
        company: true,
      },
      orderBy: { createdAt: 'asc' }, // oldest = owner
    });

    if (!companyUser) throw new Error('No user found for this company');

    // Generate a special token for impersonation
    const payload = {
      sub: companyUser.user.id,
      email: companyUser.user.email,
      impersonatedBy: superAdminId,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '1h',
    });

    return {
      accessToken,
      user: {
        id: companyUser.user.id,
        email: companyUser.user.email,
        firstName: companyUser.user.firstName,
        lastName: companyUser.user.lastName,
        isSuperAdmin: false,
        companies: [{
          companyId: companyUser.company.id,
          companyName: companyUser.company.name,
          role: companyUser.role.name,
          permissions: companyUser.role.permissions ? companyUser.role.permissions.split(',') : [],
          plan: (companyUser.company as any).plan,
          subscriptionStatus: (companyUser.company as any).subscriptionStatus,
          trialEndsAt: (companyUser.company as any).trialEndsAt,
          subscriptionWarning: null,
        }],
      },
    };
  }

  // ── #6. Get all users ──────────────────────────────────────────────────
  async getAllUsers(companyId?: string) {
    const where: any = { isSuperAdmin: false };
    if (companyId) {
      where.companies = { some: { companyId } };
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        createdAt: true,
        companies: {
          include: {
            company: { select: { id: true, name: true } },
            role: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

