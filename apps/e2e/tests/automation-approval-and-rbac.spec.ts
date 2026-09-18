import { expect, test } from '@playwright/test';
import { apiRegisterAndLogin, ERROR_ALERT_SELECTOR, loginViaUi, PASSWORD, selectRadixOption, uniqueEmail, uniqueSlug } from './helpers';

// FR-052 🔎 (AC-019, AC-020) — a CALL_AI automation never executes itself,
// it only ever lands in the Approval Queue until a human approves it.
// AC-006 — backend authorization is enforced independently of frontend
// visibility: a VIEWER who reaches a write control anyway (because a page
// doesn't bother hiding it) still gets rejected server-side, and the
// control that IS hidden client-side stays hidden.
//
// Updated 2026-09-18 for the 2026-09-17 shadcn/ui redesign (see
// docs/security-review/README.md): `/` no longer the signed-in hub,
// create/invite forms are Dialogs, every <select> is a Radix Select.
test.describe('Automation approval workflow and RBAC', () => {
  test('a CALL_AI automation sits in the Approval Queue until approved', async ({ page }) => {
    const ownerEmail = uniqueEmail('e2e-approval-owner');
    await page.goto('/register');
    await page.fill('#email', ownerEmail);
    await page.fill('#password', PASSWORD);
    await page.fill('#confirmPassword', PASSWORD);
    await page.click('button[type=submit]');
    await page.click('text=Go to login');
    await page.fill('#email', ownerEmail);
    await page.fill('#password', PASSWORD);
    await page.click('button[type=submit]');
    await page.waitForURL('**/onboarding');
    await page.fill('#name', `E2E Approval Org ${uniqueSlug('')}`);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => url.pathname === '/dashboard');

    await page.click('a[href="/automations"]');
    await page.click('button:has-text("New Automation")');
    await page.fill('#autoName', 'AI Follow-up on New Lead');
    const automationForm = page.locator('form', { has: page.locator('#autoName') });
    // Trigger select is combobox[0] (left as the default LEAD_CREATED);
    // Action select is combobox[1] — needs to become CALL_AI.
    await selectRadixOption(automationForm.locator('button[role="combobox"]').nth(1), 'Call AI (requires approval)');
    await automationForm.locator('button:text-is("Create")').click();
    await expect(page.getByText('AI Follow-up on New Lead')).toBeVisible();

    await page.click('a[href="/leads"]');
    await page.click('button:has-text("New Lead")');
    await page.fill('#newName', 'AI Approval Prospect');
    await page.click('button:text-is("Create")');
    await expect(page.getByRole('link', { name: 'AI Approval Prospect' })).toBeVisible();

    await page.click('a[href="/automations"]');
    await page.click('text=Approval Queue');
    await expect(page.getByText('Pending Approvals (1)')).toBeVisible();
    await expect(page.getByRole('link', { name: 'AI Approval Prospect' })).toBeVisible();

    await page.click('button:has-text("Approve")');
    await expect(page.getByText('Nothing pending approval right now.')).toBeVisible();
  });

  test('a VIEWER cannot create a lead (hidden client-side) or an automation (rejected server-side)', async ({ browser, request }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const ownerEmail = uniqueEmail('e2e-rbac-owner');
    await ownerPage.goto('/register');
    await ownerPage.fill('#email', ownerEmail);
    await ownerPage.fill('#password', PASSWORD);
    await ownerPage.fill('#confirmPassword', PASSWORD);
    await ownerPage.click('button[type=submit]');
    await ownerPage.click('text=Go to login');
    await ownerPage.fill('#email', ownerEmail);
    await ownerPage.fill('#password', PASSWORD);
    await ownerPage.click('button[type=submit]');
    await ownerPage.waitForURL('**/onboarding');
    await ownerPage.fill('#name', `E2E RBAC Org ${uniqueSlug('')}`);
    await ownerPage.click('button[type=submit]');
    await ownerPage.waitForURL((url) => url.pathname === '/dashboard');

    const viewer = await apiRegisterAndLogin(request, 'e2e-rbac-viewer');
    await ownerPage.click('a[href="/team"]');
    const inviteForm = ownerPage.locator('form', { has: ownerPage.locator('input[placeholder="email@example.com"]') });
    await inviteForm.locator('input[type=email]').fill(viewer.email);
    await selectRadixOption(inviteForm.locator('button[role="combobox"]'), 'Viewer');
    await inviteForm.locator('button:has-text("Invite")').click();
    await expect(ownerPage.locator(ERROR_ALERT_SELECTOR)).toHaveCount(0);
    await ownerContext.close();

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginViaUi(viewerPage, viewer.email, viewer.password);

    // Client-side gating: /leads §ui-ux "canCreate = role !== VIEWER" hides
    // the whole "New Lead" dialog trigger, not just disables it.
    await viewerPage.click('a[href="/leads"]');
    await expect(viewerPage.locator('button:has-text("New Lead")')).toHaveCount(0);

    // Server-side gating: /automations never hides its own create button,
    // so a VIEWER who opens it gets a real 403 back from the API — AC-006's
    // "backend authorization is enforced independently of frontend
    // visibility" caught for real, not just asserted in the abstract.
    await viewerPage.goto('/automations');
    await viewerPage.click('button:has-text("New Automation")');
    await viewerPage.fill('#autoName', 'Should Not Be Allowed');
    const automationForm = viewerPage.locator('form', { has: viewerPage.locator('#autoName') });
    await automationForm.locator('button:text-is("Create")').click();
    await expect(viewerPage.locator(ERROR_ALERT_SELECTOR)).toBeVisible();

    await viewerContext.close();
  });
});
