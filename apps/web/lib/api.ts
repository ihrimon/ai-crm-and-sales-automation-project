import type {
  ApiError,
  AuthTokens,
  CreateOrganizationRequest,
  InviteMemberRequest,
  LoginRequest,
  Organization,
  OrganizationMember,
  OrganizationMemberList,
  OrgRole,
  RegisterRequest,
  User,
} from '@ai-crm/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:34001/api/v1';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function parseErrorAndThrow(response: Response): Promise<never> {
  let body: ApiError | undefined;
  try {
    body = (await response.json()) as ApiError;
  } catch {
    // fall through to the generic message below
  }
  throw new ApiRequestError(body?.error.message ?? 'Something went wrong. Please try again.', body?.error.code ?? 'UNKNOWN');
}

async function authorizedFetch(path: string, accessToken: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
}

export async function register(payload: RegisterRequest): Promise<User> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function login(payload: LoginRequest): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function logout(accessToken: string): Promise<void> {
  await authorizedFetch('/auth/logout', accessToken, { method: 'POST' });
}

// Re-resolves the caller's active organization membership fresh (see
// AuthService.resolveActiveMembership) — the way to pick up a just-created
// or just-joined organization without logging out and back in.
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function createOrganization(accessToken: string, payload: CreateOrganizationRequest): Promise<Organization> {
  const res = await authorizedFetch('/organizations', accessToken, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function getOrganization(accessToken: string, organizationId: string): Promise<Organization> {
  const res = await authorizedFetch(`/organizations/${organizationId}`, accessToken);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateOrganization(
  accessToken: string,
  organizationId: string,
  payload: { name: string },
): Promise<Organization> {
  const res = await authorizedFetch(`/organizations/${organizationId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function listMembers(
  accessToken: string,
  organizationId: string,
  page = 1,
  pageSize = 20,
): Promise<OrganizationMemberList> {
  const res = await authorizedFetch(
    `/organizations/${organizationId}/members?page=${page}&pageSize=${pageSize}`,
    accessToken,
  );
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function inviteMember(
  accessToken: string,
  organizationId: string,
  payload: InviteMemberRequest,
): Promise<OrganizationMember> {
  const res = await authorizedFetch(`/organizations/${organizationId}/members`, accessToken, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateMember(
  accessToken: string,
  organizationId: string,
  memberId: string,
  payload: { role?: OrgRole; isActive?: boolean },
): Promise<OrganizationMember> {
  const res = await authorizedFetch(`/organizations/${organizationId}/members/${memberId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function removeMember(accessToken: string, organizationId: string, memberId: string): Promise<void> {
  const res = await authorizedFetch(`/organizations/${organizationId}/members/${memberId}`, accessToken, {
    method: 'DELETE',
  });
  if (!res.ok) return parseErrorAndThrow(res);
}
