import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService) {}

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
}
