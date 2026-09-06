import { defineConfig } from '@playwright/test';

// Phase 15 — cross-feature E2E, guideline/16-operations-and-compliance.md
// §40's testing pyramid ("a small but critical set of E2E tests"). Runs
// against the app's real dev servers (`pnpm dev:api` + `pnpm dev:web`),
// the same live local Postgres/Redis every milestone's manual browser
// verification has used — not a special test database, and no `webServer`
// auto-start here on purpose: this suite assumes both are already running
// (see docs/testing-plan/README.md).
export default defineConfig({
  testDir: './tests',
  // A real cross-feature journey (register -> ... -> AI score/qualify/draft
  // -> dashboard) does several real 202-then-poll AI round-trips per test;
  // 30s occasionally wasn't enough margin under load (several concurrent
  // registrations' bcrypt hashing sharing the same single-threaded dev
  // server event loop) even after fixing the two real bugs Phase 15 found
  // (see ai.processor.ts's updateWithRetryOnMissingRow and
  // tenant-scope.interceptor.ts's transaction timeout) — 60s gives real
  // margin without masking a genuinely hung request.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
