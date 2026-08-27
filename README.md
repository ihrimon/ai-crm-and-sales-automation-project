# AI CRM & Sales Automation

An AI-native, automation-first CRM: lead scoring/qualification, follow-up email drafting, conversation summarization, and a trigger→condition→action automation engine with a human-approval step for AI-derived actions — built multi-tenant from the start.

**Full documentation lives in [`docs/`](docs/README.md).** Start there, not here — this file is just the entry point:

- [docs/tracker.md](docs/tracker.md) — current progress
- [docs/guideline/](docs/guideline/README.md) — the SDLC process this project follows
- [docs/srs/](docs/srs/README.md) — the requirements (FR/NFR/use cases/acceptance criteria)
- [docs/architecture/](docs/architecture/README.md), [docs/database/](docs/database/README.md), [docs/api/](docs/api/README.md), [docs/ui-ux/](docs/ui-ux/README.md) — system design
- [docs/development-plan/](docs/development-plan/README.md) — the milestone breakdown this codebase is being built against
- [docs/bn/](docs/bn/README.md) — বাংলা ভার্সন

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

> **Port note:** this machine may already have other projects' Postgres/Redis/API bound to the "usual" ports (5432, 6379, 3001), and possibly a Next.js dev server on 3000 too. `docker-compose.yml` and `.env.example` use non-default host ports (55432, 56379, 34001) to avoid colliding with them — container-internal ports are standard. `apps/web`'s dev server has no such override, so if 3000 is taken, `next dev` just shifts to 3001 (check its terminal output for the actual port). If you're on a clean machine, feel free to switch the API-side ports back.

## Where This Is At

This repository has completed Milestones **M0 (Project Setup)** and **M1 (Database + Auth)** of [docs/development-plan/](docs/development-plan/README.md) — the workspace, database schema, CI skeleton, and a working `Auth` module (register/login/logout/refresh/password-reset/email-verify with JWT + refresh-token rotation) all exist, with real `/login`/`/register` screens. Feature modules beyond Auth (Organization, Leads, Deals, ...) aren't implemented yet. See [docs/tracker.md](docs/tracker.md) for the up-to-date status.
