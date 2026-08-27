import { CallHandler, ExecutionContext, ForbiddenException, Injectable, NestInterceptor, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { firstValueFrom, from, Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { SKIP_TENANT_SCOPE_KEY } from '../decorators/skip-tenant-scope.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

// architecture/README.md §6.1 — "Tenant Scope Interceptor: attach
// organizationId from JWT membership." Registered globally (APP_INTERCEPTOR
// in AppModule), runs after the Auth Guard + Rbac Guard (Nest runs all
// global guards, then all interceptors, in that order). Wraps the request in
// a single Prisma transaction with app.current_organization_id set via
// set_config() — every RLS policy from docs/database/rls-policies.sql keys
// off that setting (docs/database/README.md §5.6 on why this has to be a
// real transaction on the crm_app connection, not a no-op).
@Injectable()
export class TenantScopeInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skipTenantScope = this.reflector.getAllAndOverride<boolean>(SKIP_TENANT_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skipTenantScope) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user?.organizationId || !user.role || !user.memberId) {
      throw new ForbiddenException('An active organization is required for this request.');
    }

    // A route nested under /organizations/:organizationId must be about the
    // caller's OWN active organization — a different :organizationId in the
    // URL is a cross-tenant attempt (AC-007). 404, not 403: don't confirm
    // whether the other organization even exists (matches openapi.yaml's
    // NotFound convention: "not found, or not visible to the caller's scope").
    const pathOrganizationId = request.params?.organizationId;
    if (pathOrganizationId && pathOrganizationId !== user.organizationId) {
      throw new NotFoundException('Organization not found.');
    }

    const organizationId = user.organizationId;
    const role = user.role;
    const userId = user.sub;
    const memberId = user.memberId;

    return from(
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organizationId}, true)`;
        return this.tenantContext.run({ organizationId, userId, role, memberId, tx }, () =>
          firstValueFrom(next.handle()),
        );
      }),
    );
  }
}
