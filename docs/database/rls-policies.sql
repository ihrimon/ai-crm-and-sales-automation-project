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

-- ---------------------------------------------------------------------------
-- Added in M2, after a real bug: the app's own connection bypassed RLS
-- entirely. Full story in docs/database/README.md §5.6.
-- ---------------------------------------------------------------------------
--
-- `crm` (DATABASE_URL, used by Prisma Migrate) is a Postgres superuser —
-- that's just how the official postgres image's POSTGRES_USER works.
-- Superusers, and by default a table's OWNER, BYPASS RLS unconditionally.
-- `apps/api` originally connected as `crm` for everything, meaning every
-- policy above was silently inert for real application traffic the whole
-- time. Fix (migration 20260827084203_app_db_role_and_force_rls):
--
--   1. A dedicated, non-superuser, NOBYPASSRLS role for the app's actual
--      runtime connection:
--
--      CREATE ROLE crm_app WITH LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS
--        NOCREATEDB NOCREATEROLE;
--      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
--        TO crm_app;
--      ALTER DEFAULT PRIVILEGES FOR ROLE crm IN SCHEMA public
--        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
--
--   2. FORCE ROW LEVEL SECURITY on every tenant-scoped table above — belt
--      and suspenders in case ownership ever changes (crm_app not being the
--      owner already closes the gap on its own):
--
--      ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
--      -- ...repeated for all 16 tenant-scoped tables.
--
-- `apps/api`'s PrismaService now connects via APP_DATABASE_URL (`crm_app`),
-- never DATABASE_URL (`crm`) — see apps/api/src/common/prisma/prisma.service.ts.
--
-- One consequence worth knowing: OrganizationMember's own RLS policy applies
-- its USING expression as the INSERT's WITH CHECK too (Postgres default when
-- no separate WITH CHECK is given), so creating a brand-new organization's
-- first membership row must set_config() the new org's id inside the same
-- transaction, before that INSERT — there's no "current organization" to
-- have set beforehand, since the organization didn't exist yet. See
-- OrganizationService.create() in apps/api/src/organization/organization.service.ts.
--
-- A second, separate consequence: AuthService needs to resolve which of a
-- user's organizations a fresh token should be scoped to — inherently a
-- cross-organization lookup (search by userId, not yet knowing which org is
-- "current"). A plain query against RLS-protected OrganizationMember can
-- never do that (nothing sets app.current_organization_id yet, so RLS
-- filters out every row). Solved with a narrow SECURITY DEFINER function,
-- owned by `crm` (whose superuser privileges apply during the function call,
-- regardless of FORCE — FORCE only affects non-superuser owners), that
-- accepts only a userId and returns only that user's earliest active
-- membership — not a general-purpose RLS bypass:
--
--   CREATE FUNCTION resolve_active_membership(p_user_id text)
--     RETURNS TABLE (member_id text, organization_id text, role "OrgRole")
--     LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
--       SELECT "id", "organizationId", "role" FROM "OrganizationMember"
--       WHERE "userId" = p_user_id AND "isActive" = true
--       ORDER BY "createdAt" ASC LIMIT 1;
--     $$;
--   GRANT EXECUTE ON FUNCTION resolve_active_membership(text) TO crm_app;
--
-- See migration 20260827085853_resolve_active_membership_fn and
-- AuthService.resolveActiveMembership(). Extended in M3 (migration
-- 20260827151458_resolve_active_membership_include_id) to also return the
-- membership's own `id` — Lead.ownerId references OrganizationMember, not
-- User, and FR-018/"SALES_REP sees only own leads" (docs/api/README.md §2)
-- both need it in the JWT/tenant context alongside organizationId and role.
