import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PosReportsService {
  constructor(private prisma: PrismaService) {}

  async getRevenueAnalytics(companyId: string, startDate: Date, endDate: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        posSessionId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' }
      },
      select: {
        createdAt: true,
        totalAmount: true
      }
    });

    const dailyData: Record<string, number> = {};
    invoices.forEach(inv => {
      const day = inv.createdAt.toISOString().split('T')[0];
      dailyData[day] = (dailyData[day] || 0) + Number(inv.totalAmount);
    });

    return Object.entries(dailyData)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getTopSellingProducts(companyId: string, startDate: Date, endDate: Date) {
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          companyId,
          posSessionId: { not: null },
          createdAt: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' }
        }
      },
      include: { product: true }
    });

    const productStats: Record<string, { name: string; quantity: number; revenue: number }> = {};
    items.forEach(item => {
      const pid = item.productId || 'unknown';
      if (!productStats[pid]) {
        productStats[pid] = { name: item.product?.name || 'Unknown', quantity: 0, revenue: 0 };
      }
      productStats[pid].quantity += Number(item.quantity);
      productStats[pid].revenue += Number(item.totalAmount);
    });

    return Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  async getHourlySales(companyId: string, startDate: Date, endDate: Date) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        posSessionId: { not: null },
        createdAt: { gte: startDate, lte: endDate },
        status: { not: 'CANCELLED' }
      }
    });

    const hourlyData: number[] = new Array(24).fill(0);
    invoices.forEach(inv => {
      const hour = inv.createdAt.getHours();
      hourlyData[hour] += Number(inv.totalAmount);
    });

    return hourlyData.map((revenue, hour) => ({ hour: `${hour}:00`, revenue }));
  }

  async getCashierPerformance(companyId: string, startDate: Date, endDate: Date) {
    const sessions = await this.prisma.posSession.findMany({
      where: {
        companyId,
        openedAt: { gte: startDate, lte: endDate }
      },
      include: {
        invoices: {
          where: { status: { not: 'CANCELLED' } }
        }
      }
    });

    const performance: Record<string, { totalSales: number; invoiceCount: number }> = {};
    
    sessions.forEach(session => {
      if (!performance[session.userId]) {
        performance[session.userId] = { totalSales: 0, invoiceCount: 0 };
      }
      session.invoices.forEach(inv => {
        performance[session.userId].totalSales += Number(inv.totalAmount);
        performance[session.userId].invoiceCount++;
      });
    });

    const userIds = Object.keys(performance);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } }
    });

    return userIds.map(uid => {
      const user = users.find(u => u.id === uid);
      return {
        cashier: user ? `${user.firstName} ${user.lastName || ''}` : 'Unknown',
        totalSales: performance[uid].totalSales,
        invoiceCount: performance[uid].invoiceCount
      };
    });
  }

  async getProductTrends(companyId: string, startDate: Date, endDate: Date) {
    // Group items by product and date
    const items = await this.prisma.invoiceItem.findMany({
      where: {
        invoice: {
          companyId,
          posSessionId: { not: null },
          createdAt: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' }
        }
      },
      include: { product: true }
    });

    const trends: Record<string, Record<string, number>> = {}; // productId -> { date -> quantity }
    const productNames: Record<string, string> = {};

    items.forEach(item => {
      const pid = item.productId || 'unknown';
      const date = item.createdAt.toISOString().split('T')[0];
      if (!trends[pid]) trends[pid] = {};
      trends[pid][date] = (trends[pid][date] || 0) + Number(item.quantity);
      productNames[pid] = item.product?.name || 'Unknown';
    });

    // Format for charting
    return Object.entries(trends).map(([pid, dates]) => ({
      productId: pid,
      name: productNames[pid],
      data: Object.entries(dates).map(([date, quantity]) => ({ date, quantity })).sort((a,b) => a.date.localeCompare(b.date))
    }));
  }
}
