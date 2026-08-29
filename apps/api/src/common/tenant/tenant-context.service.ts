import { Injectable } from '@nestjs/common';
import type { OrgRole, Prisma } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { PrismaService } from '../prisma/prisma.service';

export interface TenantStore {
  organizationId: string;
  userId: string;
  role: OrgRole;
  // The caller's own OrganizationMember.id (M3) — see AuthenticatedUser.memberId.
  memberId: string;
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

  // M6: the same "wrap in a real transaction + set_config() + run()" pattern
  // TenantScopeInterceptor uses for an HTTP request, but for code with no
  // request to intercept — a BullMQ job processor. A worker has no
  // TenantScopeInterceptor in its call path, so without this it would either
  // use the plain PrismaService (RLS sees no app.current_organization_id,
  // silently returns nothing) or need every processor to hand-roll the same
  // set_config() dance. See docs/database/README.md §5.6 for why that dance
  // matters at all.
  async runInNewTenantTransaction<T>(
    prisma: PrismaService,
    store: Omit<TenantStore, 'tx'>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${store.organizationId}, true)`;
      return this.run({ ...store, tx }, fn);
    });
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

  get memberId(): string {
    return this.getStoreOrThrow().memberId;
  }
}
