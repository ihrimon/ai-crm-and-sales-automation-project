-- M3 needs the caller's own OrganizationMember.id (not just organizationId +
-- role) in the JWT/tenant context: Lead.ownerId references OrganizationMember,
-- not User, and FR-018's "SALES_REP sees only leads where ownerId is their
-- own membership" (docs/api/README.md §2) compares against exactly that id.
-- Extending the M2 resolve_active_membership() function rather than adding a
-- second RLS-bypassing lookup — same narrow, single-purpose escape hatch
-- (docs/database/rls-policies.sql's M2 addendum), just returning one more
-- column of data the caller is already entitled to (their own membership row).

DROP FUNCTION IF EXISTS resolve_active_membership(text);

CREATE FUNCTION resolve_active_membership(p_user_id text)
RETURNS TABLE (member_id text, organization_id text, role "OrgRole")
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "id", "organizationId", "role"
  FROM "OrganizationMember"
  WHERE "userId" = p_user_id AND "isActive" = true
  ORDER BY "createdAt" ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_active_membership(text) TO crm_app;
