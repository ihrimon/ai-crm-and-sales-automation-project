-- Row-Level Security policies — ADR-004 (docs/decisions/ADR-004-multi-tenancy-rls.md).
-- Pattern documented in docs/database/rls-policies.sql: every tenant-scoped
-- table gets RLS enabled + a policy comparing organizationId to a per-request
-- session setting, set via SET LOCAL app.current_organization_id by the API
-- (Tenant Scope Interceptor, docs/architecture/README.md §6.1) — never
-- trusted from client input. current_setting(..., true) fails closed: NULL
-- when unset, and NULL = anything is never true.
--
-- Organization and User are intentionally excluded — see rls-policies.sql.

ALTER TABLE "OrganizationMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_organization_member ON "OrganizationMember"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "LeadRotationState" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_lead_rotation_state ON "LeadRotationState"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_lead ON "Lead"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_contact ON "Contact"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_company ON "Company"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Pipeline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pipeline ON "Pipeline"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

-- PipelineStage has no organizationId column of its own — reached only
-- through its parent Pipeline (docs/database/rls-policies.sql).
ALTER TABLE "PipelineStage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pipeline_stage ON "PipelineStage"
    USING (
        "pipelineId" IN (
            SELECT id FROM "Pipeline"
            WHERE "organizationId" = current_setting('app.current_organization_id', true)
        )
    );

ALTER TABLE "Deal" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_deal ON "Deal"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_activity ON "Activity"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_task ON "Task"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AIAnalysis" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ai_analysis ON "AIAnalysis"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "EmailDraft" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_email_draft ON "EmailDraft"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Automation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_automation ON "Automation"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_automation_execution ON "AutomationExecution"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_notification ON "Notification"
    USING ("organizationId" = current_setting('app.current_organization_id', true));

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_log ON "AuditLog"
    USING ("organizationId" = current_setting('app.current_organization_id', true));
