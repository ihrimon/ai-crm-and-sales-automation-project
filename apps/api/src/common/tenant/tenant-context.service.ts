import { Injectable } from '@nestjs/common';
import type { OrgRole, Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  organizationId: string;
  userId: string;
  role: OrgRole;
  // The Prisma transaction the request is running in — set_config()'d with
  // app.current_organization_id by TenantScopeInterceptor. Every tenant-scoped
  // query must go through THIS client, not the plain PrismaService, or RLS
  // never sees the session variable (see docs/database/README.md §5.6).
  tx: Prisma.TransactionClient;
}

// Request-scoped tenant context, carried via Node's AsyncLocalStorage instead
// of a Nest REQUEST-scoped provider — REQUEST scope would force every
// injector up the chain to also become request-scoped (slower, and viral
// across modules). TenantScopeInterceptor is the only thing that calls run().
@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run<T>(store: TenantStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  private getStoreOrThrow(): TenantStore {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error(
        'TenantContextService used outside a tenant-scoped request — the route is missing tenant scope (check for a stray @SkipTenantScope()).',
      );
    }
    return store;
  }

  get tx(): Prisma.TransactionClient {
    return this.getStoreOrThrow().tx;
  }

  get organizationId(): string {
    return this.getStoreOrThrow().organizationId;
  }

  get userId(): string {
    return this.getStoreOrThrow().userId;
  }

  get role(): OrgRole {
    return this.getStoreOrThrow().role;
  }
}
