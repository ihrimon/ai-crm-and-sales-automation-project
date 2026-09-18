# Builds and runs apps/api (Phase 18 — Deployment). Build context is the
# repo root, not apps/api/, because this is a pnpm workspace: apps/api
# depends on packages/types, and pnpm needs the whole workspace (root
# lockfile + every workspace package.json) to resolve dependencies
# correctly, not just the one app.
FROM node:20-slim AS build
WORKDIR /repo

# Prisma's query engine needs libssl to detect the right binary target —
# node:20-slim (Debian) doesn't ship it by default.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

# Copy manifests first for better layer caching, then the rest.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/e2e/package.json apps/e2e/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile

COPY apps/api apps/api
COPY packages/types packages/types

RUN pnpm --filter @ai-crm/api prisma:generate
RUN pnpm --filter @ai-crm/api build

FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production

# Prisma's engine binaries need libssl at runtime too, not just at generate
# time.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# pnpm's node_modules is a symlink forest into a content-addressable store
# (apps/api/node_modules/.prisma is a symlink chain, not a real directory) —
# copying it in isolation breaks the links. Copying the whole tree the build
# stage already assembled (full workspace install + generated Prisma
# client) is what actually works, at the cost of also carrying
# devDependencies into the runtime image. Simplicity over image size for
# this deployment.
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/prisma apps/api/prisma
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/package.json /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./

RUN corepack enable && corepack prepare pnpm@10.22.0 --activate

EXPOSE 3001
# Applies pending migrations (idempotent — safe on every deploy, not just
# the first) before starting the API, matching how this project's own
# `pnpm db:migrate` works locally, per docs/database/README.md.
CMD ["sh", "-c", "cd apps/api && pnpm exec prisma migrate deploy && node dist/main.js"]
