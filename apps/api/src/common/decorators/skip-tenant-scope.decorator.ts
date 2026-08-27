import { SetMetadata } from '@nestjs/common';

export const SKIP_TENANT_SCOPE_KEY = 'skipTenantScope';

// Opts a route OUT of the global TenantScopeInterceptor — for authenticated
// routes that don't operate on tenant-scoped data (Auth's logout/email-verify
// act on User, not Organization) or that can't require an org context yet
// (creating your first organization). Opt-out, not opt-in, matching
// JwtAuthGuard's @Public() — the default for a new module's route is "needs
// tenant scope," so a forgotten decorator fails safe (an error, not a leak).
export const SkipTenantScope = () => SetMetadata(SKIP_TENANT_SCOPE_KEY, true);
