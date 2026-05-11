import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../common/tenant-context/tenant-context.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly _prisma: PrismaClient;

  constructor(private readonly tenantContextService: TenantContextService) {
    super();
    this._prisma = new PrismaClient();

    // Use Proxy to automatically route all model queries through our request-scoped extended client.
    // Unhandled property lookups will fall back to this service class itself (e.g. OnModuleInit hooks).
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) {
          return (target as any)[prop];
        }
        // Redirect model operations (like prisma.account) to our extended multi-tenant client
        return (target.client as any)[prop];
      },
    });
  }

  // Dynamic getter that returns the extended Prisma Client based on active tenant context
  get client() {
    const companyId = this.tenantContextService.getCompanyId();

    if (!companyId) {
      return this._prisma;
    }

    return this._prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantModels = [
              'Account',
              'JournalEntry',
              'JournalLine',
              'Invoice',
              'InvoiceItem',
              'Customer',
              'Vendor',
              'Payment',
            ];

            if (tenantModels.includes(model)) {
              const anyArgs = args as any;

              // 1. Automatically filter reads by active companyId
              if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(operation)) {
                anyArgs.where = anyArgs.where || {};
                anyArgs.where.companyId = companyId;
              }

              // 2. Automatically restrict updates/deletes to active companyId
              if (['update', 'updateMany', 'delete', 'deleteMany'].includes(operation)) {
                anyArgs.where = anyArgs.where || {};
                anyArgs.where.companyId = companyId;
              }

              // 3. Automatically inject companyId on create
              if (['create', 'createMany'].includes(operation)) {
                if (operation === 'create') {
                  anyArgs.data = anyArgs.data || {};
                  anyArgs.data.companyId = companyId;
                } else if (operation === 'createMany') {
                  if (Array.isArray(anyArgs.data)) {
                    anyArgs.data = anyArgs.data.map((item: any) => ({
                      ...item,
                      companyId,
                    }));
                  }
                }
              }
            }

            return query(args);
          },
        },
      },
    }) as any;
  }

  async onModuleInit() {
    await this._prisma.$connect();
  }

  async onModuleDestroy() {
    await this._prisma.$disconnect();
  }
}
