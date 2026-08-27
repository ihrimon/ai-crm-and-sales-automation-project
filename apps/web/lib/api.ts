import type {
  ApiError,
  AuthTokens,
  Company,
  CompanyList,
  Contact,
  ContactList,
  CreateCompanyRequest,
  CreateContactRequest,
  CreateLeadRequest,
  CreateOrganizationRequest,
  InviteMemberRequest,
  Lead,
  LeadList,
  LoginRequest,
  Organization,
  OrganizationMember,
  OrganizationMemberList,
  OrgRole,
  RegisterRequest,
  UpdateCompanyRequest,
  UpdateContactRequest,
  UpdateLeadRequest,
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

// M3 — Leads (FR-013–FR-018, FR-050 🔎)
export async function listLeads(
  accessToken: string,
  params: { page?: number; pageSize?: number; status?: string; search?: string } = {},
): Promise<LeadList> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.status) query.set('status', params.status);
  if (params.search) query.set('search', params.search);
  const res = await authorizedFetch(`/leads?${query.toString()}`, accessToken);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function createLead(accessToken: string, payload: CreateLeadRequest): Promise<Lead> {
  const res = await authorizedFetch('/leads', accessToken, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function getLead(accessToken: string, leadId: string): Promise<Lead> {
  const res = await authorizedFetch(`/leads/${leadId}`, accessToken);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateLead(accessToken: string, leadId: string, payload: UpdateLeadRequest): Promise<Lead> {
  const res = await authorizedFetch(`/leads/${leadId}`, accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function deleteLead(accessToken: string, leadId: string): Promise<void> {
  const res = await authorizedFetch(`/leads/${leadId}`, accessToken, { method: 'DELETE' });
  if (!res.ok) return parseErrorAndThrow(res);
}

export async function assignLead(accessToken: string, leadId: string, ownerId: string): Promise<Lead> {
  const res = await authorizedFetch(`/leads/${leadId}/assign`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ ownerId }),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

// M3 — Contacts (FR-019–FR-020)
export async function listContacts(
  accessToken: string,
  params: { page?: number; pageSize?: number; companyId?: string } = {},
): Promise<ContactList> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.companyId) query.set('companyId', params.companyId);
  const res = await authorizedFetch(`/contacts?${query.toString()}`, accessToken);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function createContact(accessToken: string, payload: CreateContactRequest): Promise<Contact> {
  const res = await authorizedFetch('/contacts', accessToken, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateContact(accessToken: string, contactId: string, payload: UpdateContactRequest): Promise<Contact> {
  const res = await authorizedFetch(`/contacts/${contactId}`, accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function deleteContact(accessToken: string, contactId: string): Promise<void> {
  const res = await authorizedFetch(`/contacts/${contactId}`, accessToken, { method: 'DELETE' });
  if (!res.ok) return parseErrorAndThrow(res);
}

// M3 — Companies (FR-021–FR-022)
export async function listCompanies(
  accessToken: string,
  params: { page?: number; pageSize?: number } = {},
): Promise<CompanyList> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  const res = await authorizedFetch(`/companies?${query.toString()}`, accessToken);
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function createCompany(accessToken: string, payload: CreateCompanyRequest): Promise<Company> {
  const res = await authorizedFetch('/companies', accessToken, { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function updateCompany(accessToken: string, companyId: string, payload: UpdateCompanyRequest): Promise<Company> {
  const res = await authorizedFetch(`/companies/${companyId}`, accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function deleteCompany(accessToken: string, companyId: string): Promise<void> {
  const res = await authorizedFetch(`/companies/${companyId}`, accessToken, { method: 'DELETE' });
  if (!res.ok) return parseErrorAndThrow(res);
}
