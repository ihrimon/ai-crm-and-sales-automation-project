-- App runtime DB role — separate from the migration-owner role ("crm").
--
-- Real bug caught while building M2 (docs/development-plan/README.md §M2,
-- "verify RLS policies from M0 actually reject a cross-org query"): the
-- `crm` role in docker-compose.yml is created via POSTGRES_USER, which the
-- official postgres image always makes a superuser. Postgres superusers
-- (and, by default, a table's owner) BYPASS Row-Level Security entirely —
-- so every RLS policy from M0's rls_policies migration was silently inert
-- for the actual application, which connects as `crm`. M0's hand-verification
-- used a separate non-owner role to test the policies, but the app itself
-- never used that role, so the "defense" half of ADR-004's defense-in-depth
-- was never actually wired up until now.
--
-- Fix: a dedicated, non-superuser, NOBYPASSRLS role (`crm_app`) that the
-- running API connects as (via APP_DATABASE_URL, see .env.example) for all
-- normal request traffic. `crm` / DATABASE_URL remains the migration-owner
-- role Prisma Migrate uses for schema changes — never for serving requests.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_app') THEN
    CREATE ROLE crm_app WITH LOGIN PASSWORD 'crm_app_dev_password' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE ai_crm TO crm_app;
GRANT USAGE ON SCHEMA public TO crm_app;

-- Every table that exists right now — crm_app needs real CRUD access, RLS
-- policies (already in place since M0) are what narrows the rows it sees.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crm_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crm_app;

-- Every table any FUTURE migration creates (owned by `crm`, e.g. M3–M8's
-- tables) grants the same rights to crm_app automatically — without this,
-- new tables would silently be unreachable by the app until someone
-- remembered to GRANT by hand.
ALTER DEFAULT PRIVILEGES FOR ROLE crm IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crm_app;
ALTER DEFAULT PRIVILEGES FOR ROLE crm IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO crm_app;

-- FORCE ROW LEVEL SECURITY: without FORCE, Postgres exempts a table's OWNER
-- from its own RLS policies by default. crm_app isn't the owner (crm is), so
-- this isn't strictly required for crm_app's sake alone — but it's cheap,
-- standard defense-in-depth (ADR-004) against a future ownership change ever
-- silently re-opening the bypass this migration just closed.
ALTER TABLE "OrganizationMember" FORCE ROW LEVEL SECURITY;
ALTER TABLE "LeadRotationState" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Lead" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Pipeline" FORCE ROW LEVEL SECURITY;
ALTER TABLE "PipelineStage" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Deal" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AIAnalysis" FORCE ROW LEVEL SECURITY;
ALTER TABLE "EmailDraft" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Automation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
