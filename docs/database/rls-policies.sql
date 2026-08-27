-- Row-Level Security policies — AI CRM & Sales Automation
-- Implements the database-layer half of ADR-004 (docs/decisions/ADR-004-multi-tenancy-rls.md).
--
-- Pattern: every tenant-scoped table (every table in schema.prisma with an
-- organizationId column, i.e. everything except User) gets:
--   1. RLS enabled
--   2. A single USING policy comparing organizationId to a per-request session setting
--
-- The API sets that session setting once per request/transaction, at the same
-- point the Tenant Scope Interceptor derives organizationId from the JWT
-- (see docs/architecture/README.md §6.1) — never trusted from client input:
--
--   SET LOCAL app.current_organization_id = '<uuid from authenticated membership>';
--
-- SET LOCAL scopes the setting to the current transaction, so it can't leak
-- across pooled connections between requests.

-- ---------------------------------------------------------------------------
-- Worked example 1: Lead
-- ---------------------------------------------------------------------------

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_lead ON "Lead"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- ---------------------------------------------------------------------------
-- Worked example 2: AutomationExecution
-- (same shape — every tenant-scoped table repeats this exactly)
-- ---------------------------------------------------------------------------

ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_automation_execution ON "AutomationExecution"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
--
-- - current_setting(..., true) — the `true` (missing_ok) argument makes the
--   function return NULL instead of raising when the setting hasn't been set,
--   which makes the policy fail closed (NULL = anything is never true) rather
--   than error out. Fail closed, not fail open.
--
-- - This is defense-in-depth, not the primary check. The application layer
--   (Prisma query scoping) is still the first and normally-sufficient filter;
--   RLS exists so a missed `WHERE organizationId = ...` in a new repository
--   method still can't leak another organization's rows.
--
-- - Every other tenant-scoped table in schema.prisma (OrganizationMember,
--   LeadRotationState, Contact, Company, Pipeline, PipelineStage*, Deal,
--   Activity, Task, AIAnalysis, EmailDraft, Automation, Notification,
--   AuditLog) needs the identical two statements, substituting the table
--   name. PipelineStage is reached only through its parent Pipeline's
--   organizationId (no direct organizationId column on PipelineStage) —
--   give it a policy keyed through a subquery on Pipeline instead:
--
--   ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY tenant_isolation_pipeline_stage ON "PipelineStage"
--       USING (
--           "pipelineId" IN (
--               SELECT id FROM "Pipeline"
--               WHERE "organizationId" = current_setting('app.current_organization_id', true)
--           )
--       );
--
-- - Definition of Done reminder (see docs/database/README.md §4): any
--   migration that adds a new tenant-scoped table must add its RLS policy
--   in that same migration, not as a follow-up.
