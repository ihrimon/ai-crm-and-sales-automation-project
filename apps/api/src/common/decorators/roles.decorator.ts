import { SetMetadata } from '@nestjs/common';
import type { OrgRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

// FR-010–FR-012, architecture/README.md §6.1's Rbac Guard. A route with no
// @Roles() at all is allowed for any authenticated member (matching
// openapi.yaml's `x-roles: []` used for e.g. createOrganization) — this
// decorator narrows further, it doesn't grant access on its own (the Auth
// Guard already required a valid token before this ever runs).
export const Roles = (...roles: OrgRole[]) => SetMetadata(ROLES_KEY, roles);
