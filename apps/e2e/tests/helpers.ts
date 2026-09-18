import type { APIRequestContext, Locator, Page } from '@playwright/test';

// Phase 15 E2E helpers — see docs/testing-plan/README.md. Runs against the
// real dev servers (pnpm dev:api / pnpm dev:web), same live local
// Postgres/Redis every milestone's manual browser verification has used.
export const API_URL = process.env.E2E_API_URL ?? 'http://localhost:34001/api/v1';

export const PASSWORD = 'E2ePassword123!';

// RFC 5321 caps an email's local part at 64 chars — keep the prefix short,
// same constraint apps/api/src/test-utils/api-test-helpers.ts documents.
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export interface ApiSession {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

// Registers + logs in a brand-new user directly via the API — used for
// background actors (a teammate who needs to already have an account before
// they can be invited) whose own registration flow isn't the thing under
// test in that spec; auth.spec.ts is what actually drives register/login
// through the real UI.
export async function apiRegisterAndLogin(request: APIRequestContext, prefix: string): Promise<ApiSession> {
  const email = uniqueEmail(prefix);
  const registerRes = await request.post(`${API_URL}/auth/register`, { data: { email, password: PASSWORD } });
  if (!registerRes.ok()) throw new Error(`register failed: ${registerRes.status()} ${await registerRes.text()}`);
  const loginRes = await request.post(`${API_URL}/auth/login`, { data: { email, password: PASSWORD } });
  if (!loginRes.ok()) throw new Error(`login failed: ${loginRes.status()} ${await loginRes.text()}`);
  const body = (await loginRes.json()) as { accessToken: string; refreshToken: string };
  return { email, password: PASSWORD, accessToken: body.accessToken, refreshToken: body.refreshToken };
}

export async function apiRefresh(
  request: APIRequestContext,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request.post(`${API_URL}/auth/refresh`, { data: { refreshToken } });
  if (!res.ok()) throw new Error(`refresh failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

// Drives the real /login screen — used for every actor whose signed-in
// state actually matters to a spec's assertions, not just as setup noise.
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

// Since the 2026-09-17 shadcn/ui redesign, every real error banner is
// components/ui/alert.tsx's <Alert>, which renders `<div role="alert">` (it
// used to be a plain `<p role="alert">`). Next.js's own client-side router
// also injects an invisible `#__next-route-announcer__` element carrying
// `role="alert"` after every navigation — excluding it by id is still
// required, only the tag changed. See docs/security-review/README.md for
// the fuller story (found re-running this suite for the first time since
// the redesign, not caused by it).
export const ERROR_ALERT_SELECTOR = '[role="alert"]:not(#__next-route-announcer__)';

// Every <select> became a Radix UI Select (components/ui/select.tsx) in the
// same redesign: a `role="combobox"` trigger button plus a portal-rendered
// `role="listbox"` of `role="option"` items, not a native <select> — so
// Playwright's `selectOption()` no longer applies. `trigger` is the
// SelectTrigger locator (or anything that opens the listbox on click);
// `optionText` matches the visible option label exactly as rendered.
export async function selectRadixOption(trigger: Locator, optionText: string | RegExp): Promise<void> {
  await trigger.click();
  await trigger.page().getByRole('option', { name: optionText }).click();
}
