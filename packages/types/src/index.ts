// Shared TypeScript types used by both apps/api and apps/web.
//
// Deliberately empty at Milestone M0 (docs/development-plan/README.md) — this
// package exists so the workspace wiring (pnpm-workspace.yaml, tsconfig
// paths) is correct from the start, per ADR-004/ADR-001's "no adding
// multi-tenancy or module boundaries later" principle applied to tooling too.
// The first real export (OrgRole, matching apps/api/prisma/schema.prisma)
// lands with Milestone M1.
export {};
