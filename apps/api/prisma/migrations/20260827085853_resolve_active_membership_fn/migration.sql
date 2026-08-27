-- A real bug caught building M2: AuthService needs to look up which of a
-- user's organizations their JWT should be scoped to (FR-012, "Tenant Scope
-- Interceptor") — but that lookup is inherently cross-organization (it has
-- to search OrganizationMember by userId, across every org the user belongs
-- to, before any single org is "active"). OrganizationMember has RLS
-- (rls-policies.sql), so a plain query from crm_app with no
-- app.current_organization_id set returns zero rows every time — not "no
-- membership," just RLS doing exactly what it's supposed to. Caught by
-- organization.integration.spec.ts, not assumed away.
--
-- Fix: a narrow SECURITY DEFINER function. It runs with the privileges of
-- its owner (`crm`, a superuser — superusers always bypass RLS, regardless
-- of FORCE ROW LEVEL SECURITY, which only affects table *owners* that aren't
-- superusers), so it can read across organizations. It's deliberately
-- narrow: takes only a userId (always the caller's own, from their verified
-- JWT `sub` — never client-suppliable), and returns only the one thing
-- AuthService needs (organizationId + role of the earliest active
-- membership) — not a general-purpose RLS bypass, and not something
-- crm_app could use to read arbitrary OrganizationMember rows directly.
CREATE OR REPLACE FUNCTION resolve_active_membership(p_user_id text)
RETURNS TABLE (organization_id text, role "OrgRole")
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "organizationId", "role"
  FROM "OrganizationMember"
  WHERE "userId" = p_user_id AND "isActive" = true
  ORDER BY "createdAt" ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_active_membership(text) TO crm_app;
