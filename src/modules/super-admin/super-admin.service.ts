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

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 3 — MONITORING & ANALYTICS
  // ══════════════════════════════════════════════════════════════════════

  // ── #6. Activity Log ──────────────────────────────────────────────────
  async logActivity(data: {
    action: string;
    entityType?: string;
    entityId?: string;
    description: string;
    performedBy?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return this.prisma.activityLog.create({ data });
  }

  async getActivityLogs(filters?: { action?: string; page?: number; limit?: number }) {
    const page = filters?.page || 1;
    const limit = filters?.limit || 50;
    const where: any = {};
    if (filters?.action) where.action = filters.action;

    const [logs, total] = await Promise.all([
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.activityLog.count({ where }),
    ]);

    return { logs, total, page, limit, pages: Math.ceil(total / limit) };
  }

  // ── #7. Revenue / Growth Dashboard ─────────────────────────────────────
  async getRevenueDashboard() {
    // Plan distribution
    const planDistribution = await this.prisma.company.groupBy({
      by: ['plan'],
      _count: { id: true },
    });

    // Status distribution
    const statusDistribution = await this.prisma.company.groupBy({
      by: ['subscriptionStatus'],
      _count: { id: true },
    });

    // Monthly growth (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const companies = await this.prisma.company.findMany({
      where: { createdAt: { gte: twelveMonthsAgo } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const monthlyGrowth: Record<string, number> = {};
    companies.forEach((c) => {
      const key = `${c.createdAt.getFullYear()}-${String(c.createdAt.getMonth() + 1).padStart(2, '0')}`;
      monthlyGrowth[key] = (monthlyGrowth[key] || 0) + 1;
    });

    // Total counts
    const totalCompanies = await this.prisma.company.count();
    const totalUsers = await this.prisma.user.count({ where: { isSuperAdmin: false } });
    const totalInvoices = await this.prisma.invoice.count();

    return {
      planDistribution: planDistribution.map((p) => ({ plan: p.plan, count: p._count.id })),
      statusDistribution: statusDistribution.map((s) => ({ status: s.subscriptionStatus, count: s._count.id })),
      monthlyGrowth: Object.entries(monthlyGrowth).map(([month, count]) => ({ month, count })),
      totals: { companies: totalCompanies, users: totalUsers, invoices: totalInvoices },
    };
  }

  // ── #8. Usage Stats ───────────────────────────────────────────────────
  async getUsageStats() {
    const companies = await this.prisma.company.findMany({
      select: {
        id: true,
        name: true,
        plan: true,
        subscriptionStatus: true,
        _count: {
          select: {
            products: true,
            invoices: true,
            accounts: true,
            posSessions: true,
            users: true,
            journalEntries: true,
            customers: true,
            vendors: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // System-wide totals
    const [totalProducts, totalInvoices, totalAccounts, totalJournals] = await Promise.all([
      this.prisma.product.count(),
      this.prisma.invoice.count(),
      this.prisma.account.count(),
      this.prisma.journalEntry.count(),
    ]);

    return {
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        plan: c.plan,
        status: c.subscriptionStatus,
        usage: {
          products: c._count.products,
          invoices: c._count.invoices,
          accounts: c._count.accounts,
          sessions: c._count.posSessions,
          users: c._count.users,
          journals: c._count.journalEntries,
          customers: c._count.customers,
          vendors: c._count.vendors,
        },
      })),
      systemTotals: {
        products: totalProducts,
        invoices: totalInvoices,
        accounts: totalAccounts,
        journals: totalJournals,
      },
    };
  }

  // ── #9. System Health ──────────────────────────────────────────────────
  async getSystemHealth() {
    const startTime = Date.now();

    // DB check
    let dbStatus = 'healthy';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'unhealthy';
    }
    const dbResponseMs = Date.now() - startTime;

    // Counts
    const [companies, users, invoices, logs] = await Promise.all([
      this.prisma.company.count(),
      this.prisma.user.count(),
      this.prisma.invoice.count(),
      this.prisma.activityLog.count(),
    ]);

    // Recent errors (from activity log)
    const recentErrors = await this.prisma.activityLog.count({
      where: {
        action: { in: ['ERROR', 'FAILED_LOGIN'] },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    return {
      status: dbStatus === 'healthy' ? 'operational' : 'degraded',
      database: { status: dbStatus, responseMs: dbResponseMs },
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      counts: { companies, users, invoices, activityLogs: logs },
      errorsLast24h: recentErrors,
      timestamp: new Date().toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PHASE 4 — BILLING
  // ══════════════════════════════════════════════════════════════════════

  // ── #10. Record Payment ────────────────────────────────────────────────
  async recordPayment(data: {
    companyId: string;
    amount: number;
    method: string;
    plan: string;
    months: number;
    reference?: string;
    notes?: string;
    recordedBy: string;
  }) {
    // Create payment record
    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        companyId: data.companyId,
        amount: data.amount,
        method: data.method,
        plan: data.plan,
        months: data.months,
        reference: data.reference,
        notes: data.notes,
        recordedBy: data.recordedBy,
      },
    });

    // Update company plan & extend subscription
    const trialEndsAt = new Date();
    trialEndsAt.setMonth(trialEndsAt.getMonth() + data.months);

    await this.prisma.company.update({
      where: { id: data.companyId },
      data: {
        plan: data.plan,
        subscriptionStatus: 'ACTIVE',
        trialEndsAt,
        suspendedReason: null,
      },
    });

    return payment;
  }

  async getPayments(companyId?: string) {
    return this.prisma.subscriptionPayment.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        company: { select: { id: true, name: true } },
      },
    });
  }

  // ── #11. Invoice Generation ────────────────────────────────────────────
  async generateInvoice(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new Error('Company not found');

    const planPrices: Record<string, number> = {
      BASIC: 2000, PRO: 5000, ENTERPRISE: 15000,
    };

    const amount = planPrices[company.plan] || 0;

    return {
      invoiceNumber: `INV-${Date.now()}`,
      companyId: company.id,
      companyName: company.name,
      plan: company.plan,
      amount,
      currency: 'PKR',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
      generatedAt: new Date().toISOString(),
      items: [
        { description: `${company.plan} ماہانہ سبسکرپشن — ${company.name}`, amount },
      ],
    };
  }

  // ── #12. Coupon Codes ──────────────────────────────────────────────────
  async createCoupon(data: {
    code: string;
    discountType: string;
    discountValue: number;
    maxUses: number;
    validUntil?: string;
    applicablePlan?: string;
  }) {
    return this.prisma.couponCode.create({
      data: {
        code: data.code.toUpperCase(),
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxUses: data.maxUses,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        applicablePlan: data.applicablePlan || null,
      },
    });
  }

  async getCoupons() {
    return this.prisma.couponCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleCoupon(id: string) {
    const coupon = await this.prisma.couponCode.findUnique({ where: { id } });
    if (!coupon) throw new Error('Coupon not found');
    return this.prisma.couponCode.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });
  }

  async deleteCoupon(id: string) {
    return this.prisma.couponCode.delete({ where: { id } });
  }
}
