import { expect, test } from '@playwright/test';
import { apiRegisterAndLogin, ERROR_ALERT_SELECTOR, loginViaUi, PASSWORD, selectRadixOption, uniqueEmail, uniqueSlug } from './helpers';

// M8 (FR-046–FR-048): a NOTIFY automation creates a real Notification for
// the lead's owner, the sidebar's unread badge reflects it, /notifications
// lets that owner mark it read, and /audit-log shows the trail — driven as
// two real actors in two separate browser contexts (owner + the rep who
// gets notified), not one session pretending to be both.
//
// Updated 2026-09-18 for the 2026-09-17 shadcn/ui redesign (see
// docs/security-review/README.md): the unread-count badge is now a sibling
// `data-sidebar="menu-badge"` element next to the sidebar's Notifications
// link, not text inside the link itself; a NOTIFY notification's `type`
// ('AUTOMATION') is now rendered lowercased ('automation'), not verbatim.
test.describe('Notifications and Audit Log', () => {
  test('a NOTIFY automation notifies the round-robin-assigned rep, and the owner sees the Lead CREATE in the audit trail', async ({
    browser,
    page: ownerPage,
    request,
  }) => {
    const ownerEmail = uniqueEmail('e2e-notif-owner');

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
    await ownerPage.fill('#name', `E2E Notif Org ${uniqueSlug('')}`);
    await ownerPage.click('button[type=submit]');
    await ownerPage.waitForURL((url) => url.pathname === '/dashboard');

    // The only active SALES_REP -> round-robin assigns every new lead to
    // them, giving the NOTIFY automation a real recipient.
    const rep = await apiRegisterAndLogin(request, 'e2e-notif-rep');
    await ownerPage.click('a[href="/team"]');
    const inviteForm = ownerPage.locator('form', { has: ownerPage.locator('input[placeholder="email@example.com"]') });
    await inviteForm.locator('input[type=email]').fill(rep.email);
    await selectRadixOption(inviteForm.locator('button[role="combobox"]'), 'Sales Rep');
    await inviteForm.locator('button:has-text("Invite")').click();
    await expect(ownerPage.locator(ERROR_ALERT_SELECTOR)).toHaveCount(0);

    await ownerPage.click('a[href="/automations"]');
    await ownerPage.click('button:has-text("New Automation")');
    await ownerPage.fill('#autoName', 'Notify Owner on New Lead');
    const automationForm = ownerPage.locator('form', { has: ownerPage.locator('#autoName') });
    await selectRadixOption(automationForm.locator('button[role="combobox"]').nth(1), 'NOTIFY');
    await automationForm.locator('button:text-is("Create")').click();
    await expect(ownerPage.getByText('Notify Owner on New Lead')).toBeVisible();

    await ownerPage.click('a[href="/leads"]');
    await ownerPage.click('button:has-text("New Lead")');
    await ownerPage.fill('#newName', 'Notif Prospect');
    await ownerPage.click('button:text-is("Create")');
    await expect(ownerPage.getByRole('link', { name: 'Notif Prospect' })).toBeVisible();

    // --- The rep, in their own browser context, sees the notification ---
    const repContext = await browser.newContext();
    const repPage = await repContext.newPage();
    await loginViaUi(repPage, rep.email, rep.password);
    await repPage.goto('/dashboard');
    const notifMenuItem = repPage.locator('li[data-sidebar="menu-item"]', { has: repPage.locator('a[href="/notifications"]') });
    await expect(notifMenuItem.locator('[data-sidebar="menu-badge"]')).toHaveText('1');

    await repPage.click('a[href="/notifications"]');
    await expect(repPage.getByText('automation', { exact: true })).toBeVisible();
    await expect(repPage.getByText('Notify Owner on New Lead')).toBeVisible();
    await repPage.click('button:has-text("Mark read")');
    // Wait for the mark-read PATCH to actually land (the button unmounts
    // once isRead flips) before filtering — page.click() only waits for the
    // click event to dispatch, not for the async handler it triggers.
    await expect(repPage.locator('button:has-text("Mark read")')).toHaveCount(0);
    await repPage.click('text=Unread only');
    await expect(repPage.getByText('No unread notifications.')).toBeVisible();
    await repContext.close();

    // --- The owner sees the Lead CREATE audit trail, no secrets exposed ---
    await ownerPage.goto('/audit-log');
    await ownerPage.fill('input[placeholder="Entity type (e.g. Lead)"]', 'Lead');
    await ownerPage.click('button:has-text("Filter")');
    const leadRow = ownerPage.locator('table tbody tr', { hasText: 'Lead' }).first();
    await expect(leadRow).toContainText('CREATE');
    await expect(ownerPage.getByText(/passwordHash/i)).toHaveCount(0);
  });
});
