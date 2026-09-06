import { expect, test } from '@playwright/test';
import { PASSWORD, uniqueEmail } from './helpers';

// AC-001 (Registration), AC-002 (Login), AC-003 (Logout) · guideline/16-
// operations-and-compliance.md §40's "Login" E2E example. Drives the real
// /register and /login screens rather than the API directly — this is the
// one spec where the auth UI itself is the thing under test.
test.describe('Authentication', () => {
  test('register, log in, session persists across reload, wrong password is rejected safely', async ({ page }) => {
    const email = uniqueEmail('e2e-auth');

    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.fill('#confirmPassword', PASSWORD);
    await page.click('button[type=submit]');
    await expect(page.getByText('Account created')).toBeVisible();

    await page.click('text=Go to login');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');

    // No organization yet -> the homepage effect redirects to /onboarding.
    await page.waitForURL('**/onboarding', { timeout: 10_000 });
    await expect(page.getByText('Create your organization')).toBeVisible();

    // AC-002: an authenticated session survives a reload without being
    // bounced back to /login.
    await page.reload();
    await expect(page.getByText('Create your organization')).toBeVisible();

    // AC-002: invalid credentials are rejected, with no sensitive detail
    // leaked (a generic error, not e.g. "no account with that email").
    await page.goto('/login');
    await page.fill('#email', email);
    await page.fill('#password', 'TotallyWrongPassword!');
    await page.click('button[type=submit]');
    // NOT getByRole('alert') — Next.js's route announcer also carries
    // role="alert" after a Link navigation (see mvp-journey.spec.ts); every
    // real error banner in this app is a `<p role="alert">`.
    await expect(page.locator('p[role="alert"]')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('logout actually revokes the session (AC-003) — the refresh token no longer works after', async ({ page, request }) => {
    const email = uniqueEmail('e2e-logout');
    await page.goto('/register');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.fill('#confirmPassword', PASSWORD);
    await page.click('button[type=submit]');
    await page.click('text=Go to login');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/onboarding');

    // Create an organization so the homepage renders the signed-in view
    // with a Log out button (docs/ui-ux/README.md's homepage nav).
    await page.fill('#name', `E2E Logout Org ${Date.now()}`);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => url.pathname === '/');

    const refreshToken = await page.evaluate(() => {
      const raw = localStorage.getItem('ai-crm.session');
      return raw ? (JSON.parse(raw) as { refreshToken: string }).refreshToken : null;
    });
    expect(refreshToken).toBeTruthy();

    await page.click('button:has-text("Log out")');
    // Logout clears the session client-side and stays on `/`, which then
    // re-renders as the signed-out marketing view (Log in / Register links).
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();

    // The revoked refresh token must no longer mint new access tokens.
    const refreshAfterLogout = await request.post(`${process.env.E2E_API_URL ?? 'http://localhost:34001/api/v1'}/auth/refresh`, {
      data: { refreshToken },
    });
    expect(refreshAfterLogout.ok()).toBe(false);
  });
});
