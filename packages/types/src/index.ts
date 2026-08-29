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

// M7 — Automation Engine (FR-042–FR-045, FR-052 🔎)
export type AutomationTriggerType = 'LEAD_CREATED' | 'DEAL_STAGE_CHANGED' | 'NO_RESPONSE' | 'DEAL_WON';
export type AutomationActionType = 'ASSIGN_LEAD_ROUND_ROBIN' | 'SEND_EMAIL' | 'CREATE_TASK' | 'NOTIFY' | 'CALL_AI' | 'WEBHOOK';

// {field, operator, value} — the only conditionJson shape the API accepts
// (apps/api/src/automation/automation-condition.util.ts).
export interface AutomationConditionRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

export interface Automation {
  id: string;
  organizationId: string;
  name: string;
  triggerType: AutomationTriggerType;
  conditionJson: AutomationConditionRule | null;
  actionType: AutomationActionType;
  isActive: boolean;
  createdAt: string;
}

export interface AutomationList {
  data: Automation[];
  meta: PageMeta;
}

export interface CreateAutomationRequest {
  name: string;
  triggerType: AutomationTriggerType;
  conditionJson?: AutomationConditionRule;
  actionType: AutomationActionType;
  isActive?: boolean;
}

export type UpdateAutomationRequest = Partial<CreateAutomationRequest>;

export type AutomationTriggeredByType = 'RULE' | 'AI';
export type AutomationExecutionStatus = 'EXECUTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISMISSED' | 'FAILED';

export interface AutomationExecution {
  id: string;
  organizationId: string;
  automationId: string;
  leadId: string | null;
  dealId: string | null;
  triggeredByType: AutomationTriggeredByType;
  status: AutomationExecutionStatus;
  resultJson: Record<string, unknown> | null;
  error: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  executedAt: string;
}

export interface AutomationExecutionList {
  data: AutomationExecution[];
  meta: PageMeta;
}

// M8 — Audit + Notifications (FR-046–FR-048)
export interface Notification {
  id: string;
  organizationId: string;
  recipientMemberId: string;
  type: string;
  payload: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationList {
  data: Notification[];
  meta: PageMeta;
}

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';

export interface AuditLog {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogList {
  data: AuditLog[];
  meta: PageMeta;
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
