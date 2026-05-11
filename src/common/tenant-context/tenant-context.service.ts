import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

  runWithTenant(companyId: string, callback: () => any) {
    const store = new Map<string, string>();
    store.set('companyId', companyId);
    return TenantContextService.asyncLocalStorage.run(store, callback);
  }

  getCompanyId(): string | null {
    const store = TenantContextService.asyncLocalStorage.getStore();
    return store ? store.get('companyId') || null : null;
  }
}
