import { expect, test } from '@playwright/test';
import { ERROR_ALERT_SELECTOR, PASSWORD, uniqueEmail } from './helpers';

// AC-001 (Registration), AC-002 (Login), AC-003 (Logout) — the guideline's
// own named "Login" E2E example. Drives the real /register and /login
// screens rather than the API directly — this is the one spec where the
// auth UI itself is the thing under test.
//
// Updated 2026-09-18 for the 2026-09-17 shadcn/ui redesign: the homepage
// (`/`) is no longer the signed-in hub — a persistent sidebar is, and `/`
// itself now redirects straight to `/dashboard` (or `/onboarding` with no
// org yet). Logout moved from a visible button into the NavUser dropdown in
// the sidebar footer, and now navigates to `/login` instead of staying on
// `/`. See docs/security-review/README.md for the full story.
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

    // No organization yet -> DashboardLayout's own effect bounces /dashboard
    // straight to /onboarding.
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
    await expect(page.locator(ERROR_ALERT_SELECTOR)).toBeVisible();
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

    // Create an organization — onboarding pushes straight to /dashboard.
    await page.fill('#name', `E2E Logout Org ${Date.now()}`);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => url.pathname === '/dashboard');

    const refreshToken = await page.evaluate(() => {
      const raw = localStorage.getItem('ai-crm.session');
      return raw ? (JSON.parse(raw) as { refreshToken: string }).refreshToken : null;
    });
    expect(refreshToken).toBeTruthy();

    // Log out lives behind the user-menu dropdown in the sidebar footer
    // (components/nav-user.tsx) now, not a standalone visible button.
    await page.click(`button:has-text("${email}")`);
    await page.click('[role="menuitem"]:has-text("Log out")');
    // DashboardLayout's handleLogout clears the session then replaces to
    // /login — it no longer stays on `/` re-rendering as a marketing page.
    await page.waitForURL((url) => url.pathname === '/login');

    // The revoked refresh token must no longer mint new access tokens.
    const refreshAfterLogout = await request.post(`${process.env.E2E_API_URL ?? 'http://localhost:34001/api/v1'}/auth/refresh`, {
      data: { refreshToken },
    });
    expect(refreshAfterLogout.ok()).toBe(false);
  });
});
