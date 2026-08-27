import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OrgRole } from '@prisma/client';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';

// architecture/README.md §6.1 — "Rbac Guard: are you allowed to do this?",
// runs after the (also global) JwtAuthGuard. A route with no @Roles() is
// left to "any authenticated user" (matching openapi.yaml's `x-roles: []`
// used for e.g. createOrganization) — this guard only narrows further when
// @Roles(...) names specific OrgRole values. Public routes never reach here:
// JwtAuthGuard already returned true without setting request.user.
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const role = request.user?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }
    return true;
  }
}
