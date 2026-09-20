# AI CRM & Sales Automation

An AI-native, automation-first CRM: lead scoring/qualification, follow-up email drafting, conversation summarization, and a trigger→condition→action automation engine with a human-approval step for AI-derived actions — built multi-tenant from the start.

**Live demo:** [ai-crm-sales-automation.vercel.app](https://ai-crm-sales-automation.vercel.app) (frontend, Vercel) · API at [api-production-dd96.up.railway.app](https://api-production-dd96.up.railway.app/health) (Railway). Sign in with the ready-made demo account — `demo@ai-crm-demo.app` / `DemoCRM2026!` (organization owner, pre-loaded with leads, deals, a pipeline, tasks, automations and AI results; a sales-rep login `rep@ai-crm-demo.app` with the same password shows the role-restricted view) — or register your own. AI features run on a deterministic stub provider (no live Anthropic key configured for this deployment yet), so scoring/qualification/email-draft results are consistent placeholders, not real model output.

**Full documentation lives in [`docs/`](docs/README.md).** Start there, not here — this file is just the entry point:

- [docs/tracker.md](docs/tracker.md) — current progress
- [docs/srs/](docs/srs/README.md) — the requirements (FR/NFR/use cases/acceptance criteria)
- [docs/decisions/](docs/decisions/README.md) — why each major technical decision was made (7 ADRs)
- [docs/architecture/](docs/architecture/README.md), [docs/database/](docs/database/README.md), [docs/api/](docs/api/README.md), [docs/ui-ux/](docs/ui-ux/README.md) — system design
- [docs/development-plan/](docs/development-plan/README.md) — the milestone breakdown this codebase was built against
- [docs/testing-plan/](docs/testing-plan/README.md) — the cross-feature E2E testing pass (Phase 15)
- [docs/security-review/](docs/security-review/README.md) — the security review pass (Phase 16)
- [docs/deployment/](docs/deployment/README.md) — how and where this is deployed (Phase 18)
- [SUMMARY.md](SUMMARY.md) — a single-file orientation doc for a new session/reader (start here if you want the whole project in one read)
- [docs/bn/](docs/bn/README.md) — বাংলা: progress tracker + per-milestone reports + a user guide

## Structure

```text
apps/
├── api/     — NestJS backend (modular monolith, ADR-001)
└── web/     — Next.js frontend

packages/
└── types/   — shared TypeScript types, populated incrementally as milestones land
```

## Getting Started

```bash
cp .env.example .env          # then fill in real values
cp .env.example apps/api/.env # Prisma/Nest read .env from apps/api, not the repo root
docker compose up -d          # PostgreSQL + Redis (non-default host ports — see docker-compose.yml)
pnpm install
pnpm db:migrate                # apply apps/api/prisma/schema.prisma + RLS policies
pnpm dev:api                   # http://localhost:34001
pnpm dev:web                   # http://localhost:3000 (or the next free port — see the port note below)
```

Health check once the API is running: `curl http://localhost:34001/health`.

Optional: `pnpm seed:demo` fills a local instance with the same demo organization the live site uses (goes through the real HTTP API; safe to re-run — it skips if the demo owner already exists). Point it at another deployment with `SEED_API_URL=https://<api-host>/api/v1`.

> **Port note:** this machine may already have other projects' Postgres/Redis/API bound to the "usual" ports (5432, 6379, 3001), and possibly a Next.js dev server on 3000 too. `docker-compose.yml` and `.env.example` use non-default host ports (55432, 56379, 34001) to avoid colliding with them — container-internal ports are standard. `apps/web`'s dev server has no such override, so if 3000 is taken, `next dev` just shifts to 3001 (check its terminal output for the actual port). If you're on a clean machine, feel free to switch the API-side ports back.

## Where This Is At

All 9 planned milestones (**M0–M8**) of [docs/development-plan/](docs/development-plan/README.md) are done, plus a cross-feature E2E testing pass (Phase 15): `Auth`, `Organization`/RBAC, `Lead`/`Contact`/`Company` (with round-robin auto-assignment), `Pipeline`/`Deal` (Kanban board), `Activity`/`Task`/`Dashboard`, `Ai` (scoring/qualification/summarization/email drafts, async via BullMQ), `Automation` (trigger→condition→action engine with a human-approval gate on AI-derived actions), and `Audit`/`Notification` are all real, tested modules in `apps/api`, with matching real screens in `apps/web` for every one of them. 261 backend tests (unit + integration, against a real Postgres) and 4 Playwright cross-feature journeys all pass.

The frontend also got a shadcn/ui-based redesign after Phase 15 (a `(dashboard)` route group replacing the original plain-Tailwind screens) — a visual/component pass, not a feature change. Phase 16 (Security Review) is fully done (dependency audit down to zero known vulnerabilities, secrets scan, CORS/rate-limiting/security headers, a Next.js 15 upgrade, a NestJS 10→11 upgrade), and Phase 18 (Deployment) is live — see the demo link above. One real bug was found deploying (a Next.js 15 client-router-cache issue on the Deals creation dialog, live-only, never reproduced on localhost) and was fixed the same day. Phase 17 (Performance Optimization) is also done: found and fixed a real N+1 query pattern in a background automation sweep, and confirmed index coverage/aggregation queries/bundle sizes were already clean. Phase 19 (Monitoring) is done too: `/health` used to always report "ok" with no actual check behind it — it now really probes Postgres and Redis and returns 503 when either is down — plus structured HTTP request logging with a request ID that correlates a client-facing error to its exact server log line.

Next up: Phase 21 (Case Study/Portfolio write-up). See [docs/tracker.md](docs/tracker.md) for the up-to-date status, or [SUMMARY.md](SUMMARY.md) for a full single-file project orientation.
