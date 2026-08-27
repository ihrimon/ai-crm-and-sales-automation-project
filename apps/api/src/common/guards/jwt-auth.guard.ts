import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { OrgRole } from '@prisma/client';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

export interface AuthenticatedUser {
  sub: string;
  email: string;
  // Present once the user has at least one active OrganizationMember —
  // resolved fresh at login/refresh time (M2, see AuthService). Absent for a
  // brand-new registrant who hasn't created/joined an org yet.
  organizationId?: string;
  role?: OrgRole;
  // The caller's own OrganizationMember.id (M3) — Lead/Deal `ownerId` and
  // similar fields reference OrganizationMember, not User, and row-level
  // scoping rules (e.g. "SALES_REP sees only leads where ownerId is their
  // own membership," docs/api/README.md §2) compare against exactly this.
  memberId?: string;
}

// architecture/README.md §6.1 — "Auth Guard: who are you?", the first gate
// every request passes through. Registered globally (APP_GUARD in
// AppModule); a route opts OUT via @Public() rather than opting in, so a
// future module that forgets to think about auth is protected by default
// instead of silently open (NFR-006). The Rbac Guard and Tenant Scope
// Interceptor that come after this one in the flow land with M2.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
