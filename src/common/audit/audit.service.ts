import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditLogEntry {
  companyId: string;
  userId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VOID' | 'POST' | 'LOGIN' | 'SEND';
  entity: string;
  entityId?: string;
  description: string;
  changes?: Record<string, { old: any; new: any }>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an audit event. Fire-and-forget — never blocks business logic.
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: entry.companyId,
          userId: entry.userId || null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId || null,
          description: entry.description,
          changes: entry.changes ? JSON.stringify(entry.changes) : null,
          ipAddress: entry.ipAddress || null,
          userAgent: entry.userAgent || null,
        },
      });
    } catch (err) {
      // Audit logging must NEVER crash the application
      console.error('[AuditService] Failed to write audit log:', err);
    }
  }

  /**
   * Retrieve audit logs for a company (paginated)
   */
  async findAll(
    companyId: string,
    options?: {
      page?: number;
      limit?: number;
      entity?: string;
      action?: string;
      userId?: string;
    },
  ) {
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 50, 200);
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (options?.entity) where.entity = options.entity;
    if (options?.action) where.action = options.action;
    if (options?.userId) where.userId = options.userId;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}
