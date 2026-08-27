// Shared TypeScript types used by both apps/api and apps/web.
//
// First real exports, landing with Milestone M1 (docs/development-plan/README.md):
// the Auth vocabulary both the API's request/response shapes and the web
// app's login/register forms need to agree on. Mirrors
// apps/api/prisma/schema.prisma and docs/api/openapi.yaml field-for-field —
// no separate "frontend DTO" vocabulary to keep in sync by hand.

export type OrgRole = 'OWNER' | 'ADMIN' | 'SALES_MANAGER' | 'SALES_REP' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// M2 — Organization + RBAC (FR-006–FR-012)
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgRole;
  isActive: boolean;
  createdAt: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface OrganizationMemberList {
  data: OrganizationMember[];
  meta: PageMeta;
}

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
}

export interface InviteMemberRequest {
  email: string;
  role: OrgRole;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
