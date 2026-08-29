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

// M3 — Leads, Contacts, Companies (FR-013–FR-022, FR-050 🔎)
export type LeadStatus = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED' | 'CONVERTED' | 'LOST';

export interface Lead {
  id: string;
  organizationId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: LeadStatus;
  industry: string | null;
  jobTitle: string | null;
  budget: number | null;
  score: number | null;
  lostReason: string | null;
  lastContactedAt: string | null;
  nextFollowUpDate: string | null;
  ownerId: string | null;
  contactId: string | null;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadList {
  data: Lead[];
  meta: PageMeta;
}

export interface CreateLeadRequest {
  name: string;
  email?: string;
  phone?: string;
  source?: string;
  industry?: string;
  jobTitle?: string;
  budget?: number;
  ownerId?: string;
  contactId?: string;
  companyId?: string;
}

export type UpdateLeadRequest = Partial<CreateLeadRequest> & {
  status?: LeadStatus;
  lostReason?: string;
  nextFollowUpDate?: string;
};

export interface Contact {
  id: string;
  organizationId: string;
  companyId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  position: string | null;
  preferredChannel: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContactList {
  data: Contact[];
  meta: PageMeta;
}

export interface CreateContactRequest {
  name: string;
  email?: string;
  phone?: string;
  position?: string;
  preferredChannel?: string;
  companyId?: string;
}

export type UpdateContactRequest = Partial<CreateContactRequest>;

export interface Company {
  id: string;
  organizationId: string;
  name: string;
  website: string | null;
  industry: string | null;
  companySize: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyList {
  data: Company[];
  meta: PageMeta;
}

export interface CreateCompanyRequest {
  name: string;
  website?: string;
  industry?: string;
  companySize?: string;
}

export type UpdateCompanyRequest = Partial<CreateCompanyRequest>;

// M4 — Deals + Pipeline (FR-023–FR-029)
export interface Pipeline {
  id: string;
  organizationId: string;
  name: string;
  isDefault: boolean;
}

export interface PipelineStage {
  id: string;
  pipelineId: string;
  name: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
}

export interface CreatePipelineStageRequest {
  name: string;
  order: number;
  isWon?: boolean;
  isLost?: boolean;
}

export interface UpdatePipelineStageRequest {
  name?: string;
  order?: number;
}

export interface PipelineMetrics {
  totalValue: number;
  countByStage: Record<string, number>;
}

export interface Deal {
  id: string;
  organizationId: string;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  pipelineStageId: string;
  ownerId: string | null;
  title: string;
  value: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  lostReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DealList {
  data: Deal[];
  meta: PageMeta;
}

export interface CreateDealRequest {
  title: string;
  value?: number;
  currency?: string;
  probability?: number;
  expectedCloseDate?: string;
  pipelineStageId: string;
  leadId?: string;
  contactId?: string;
  companyId?: string;
  ownerId?: string;
}

export type UpdateDealRequest = Partial<CreateDealRequest> & {
  lostReason?: string;
};

export interface MoveDealRequest {
  pipelineStageId: string;
  lostReason?: string;
}

// M5 — Activities, Tasks, Dashboard (FR-030–FR-035)
export type ActivityType = 'CALL' | 'EMAIL' | 'MEETING' | 'NOTE' | 'STAGE_CHANGE' | 'OTHER';

export interface Activity {
  id: string;
  organizationId: string;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  createdById: string | null;
  type: ActivityType;
  notes: string | null;
  occurredAt: string;
}

export interface ActivityList {
  data: Activity[];
  meta: PageMeta;
}

// Exactly one of leadId/contactId/companyId/dealId must be set
// (docs/database/README.md §5.2).
export interface CreateActivityRequest {
  type: ActivityType;
  notes?: string;
  occurredAt?: string;
  leadId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export type TaskStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface Task {
  id: string;
  organizationId: string;
  leadId: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  assignedToId: string | null;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  data: Task[];
  meta: PageMeta;
}

// Exactly one of leadId/contactId/companyId/dealId must be set
// (docs/database/README.md §5.2).
export interface CreateTaskRequest {
  title: string;
  dueDate?: string;
  assignedToId?: string;
  leadId?: string;
  contactId?: string;
  companyId?: string;
  dealId?: string;
}

export interface UpdateTaskRequest {
  status?: TaskStatus;
  dueDate?: string;
}

export interface DashboardMetrics {
  totalLeads: number;
  qualifiedLeads: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  pipelineValue: number;
  conversionRate: number;
}

// M6 — AI Integration (FR-036–FR-041, FR-051 🔎)
export type AIAnalysisType = 'SCORE' | 'QUALIFICATION' | 'SUMMARY';
export type AIAnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface AIAnalysis {
  id: string;
  organizationId: string;
  leadId: string;
  type: AIAnalysisType;
  status: AIAnalysisStatus;
  score: number | null;
  classification: string | null;
  reasons: string[] | null;
  recommendedAction: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface RequestAiAnalysisRequest {
  type: AIAnalysisType;
}

export type EmailDraftStatus = 'PENDING' | 'DRAFT' | 'DISCARDED' | 'SENT_MANUALLY' | 'FAILED';

export interface EmailDraft {
  id: string;
  organizationId: string;
  leadId: string | null;
  contactId: string | null;
  subject: string | null;
  body: string | null;
  tone: string | null;
  status: EmailDraftStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface CreateEmailDraftRequest {
  tone?: string;
}

export interface UpdateEmailDraftRequest {
  subject?: string;
  body?: string;
  status?: EmailDraftStatus;
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
