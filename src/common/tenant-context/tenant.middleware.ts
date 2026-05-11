import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from './tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantContextService: TenantContextService) {}

  use(req: any, res: Response, next: NextFunction) {
    // Try to extract companyId from headers, query, or user object (attached by JWT guard)
    let companyId = req.headers['x-company-id'] as string || req.query.companyId as string;

    // If user object is already populated by auth guard (for routes where guard runs before middleware)
    if (!companyId && req.user && req.user.companyId) {
      companyId = req.user.companyId;
    }

    if (companyId) {
      // Run the entire request lifetime inside AsyncLocalStorage containing companyId
      this.tenantContextService.runWithTenant(companyId, () => {
        next();
      });
    } else {
      next();
    }
  }
}
