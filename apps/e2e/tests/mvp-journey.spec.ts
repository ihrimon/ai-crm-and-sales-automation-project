import { expect, test } from '@playwright/test';
import { apiRegisterAndLogin, PASSWORD, uniqueEmail, uniqueSlug } from './helpers';

// The flagship E2E test — mirrors docs/srs/08-acceptance-criteria.md §15
// "Final MVP Acceptance" literally: Register -> CreateOrg -> Invite ->
// CreateLead -> Assign -> Qualify -> Score -> CreateDeal -> Move -> Draft ->
// Automation -> Dashboard. One deliberate reordering vs. that diagram: the
// Automation step is created right after Invite, before CreateLead, not
// near the end — an automation has to be *configured* before the event
// it's listening for happens, so "create a LEAD_CREATED automation" must
// precede "create a lead" for it to actually fire (the diagram describes
// which capabilities the MVP must demonstrate, not a strict click order).
test.describe('Final MVP journey (AC-028, srs/08-acceptance-criteria.md §15)', () => {
  test('register through dashboard, touching every core feature area in one flow', async ({ page, request }) => {
    const ownerEmail = uniqueEmail('e2e-mvp-owner');

    // --- Register + Login (AC-001, AC-002) ---
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

    // --- Create Organization (AC-004) ---
    const orgName = `E2E MVP Org ${uniqueSlug('')}`;
    await page.fill('#name', orgName);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => url.pathname === '/');
    await expect(page.getByText('Role: OWNER')).toBeVisible();

    // --- Invite a teammate (AC-005) — the invitee needs an existing account
    // first (no email provider exists yet, docs/development-plan/README.md
    // §M1), so the rep registers via the API, not through this UI.
    const rep = await apiRegisterAndLogin(request, 'e2e-mvp-rep');
    await page.click('a[href="/team"]');
    const inviteForm = page.locator('form', { has: page.locator('input[placeholder="email@example.com"]') });
    await inviteForm.locator('input[type=email]').fill(rep.email);
    await inviteForm.locator('select').selectOption('SALES_REP');
    await inviteForm.locator('button:has-text("Invite")').click();
    // NOT page.getByRole('alert') — Next.js's client-side router injects its
    // own invisible #__next-route-announcer__ (also role="alert") after any
    // Link navigation, so that locator always has >=1 match post-navigation.
    // Every real error banner in this app is a `<p role="alert">`.
    await expect(page.locator('p[role="alert"]')).toHaveCount(0);

    // --- Create an automation before the event it reacts to (AC-019) ---
    await page.click('a[href="/"]');
    await page.click('a[href="/automations"]');
    await page.click('button:has-text("+ New Automation")');
    await page.fill('input[placeholder="Automation name"]', 'Create Follow-up Task on New Lead');
    // Default trigger/action selects are already LEAD_CREATED / CREATE_TASK.
    await page.click('button:has-text("Create")');
    await expect(page.getByText('Create Follow-up Task on New Lead')).toBeVisible();

    // --- Create Lead (AC-008) — this also fires the automation above ---
    await page.click('a[href="/"]');
    await page.click('a[href="/leads"]');
    await page.click('button:has-text("+ New Lead")');
    await page.fill('input[placeholder="Lead name"]', 'Jane Prospect');
    await page.click('button:has-text("Create")');
    await expect(page.getByRole('link', { name: 'Jane Prospect' })).toBeVisible();
    await page.click('text=Jane Prospect');
    await page.waitForURL(/\/leads\/.+/);

    // --- Assign (AC-010) — the UI control this E2E pass added (Phase 15
    // found docs/ui-ux/README.md §5.3's "[Assign]*" wireframe control had
    // never actually been wired up on Lead Detail; see
    // docs/testing-plan/README.md for the fix). ---
    const repOptionText = (await page.locator('#assignToId option', { hasText: /\(SALES_REP\)/ }).textContent())?.trim();
    expect(repOptionText).toBeTruthy();
    await page.selectOption('#assignToId', { label: repOptionText! });
    await page.click('button:has-text("Assign")');
    await expect(page.locator('p', { hasText: 'Owner:' })).not.toHaveText('Owner: Unassigned');

    // --- AI Qualification (AC-016) then AI Lead Scoring (AC-015) — the
    // stub provider (no ANTHROPIC_API_KEY configured) is deterministic and
    // fast, but this still exercises the real 202-then-poll BullMQ flow. ---
    await page.click('button:has-text("Qualify with AI")');
    await expect(page.getByText('Classification:')).toBeVisible({ timeout: 15_000 });
    await page.click('button:has-text("Score with AI")');
    await expect(page.getByText(/^Score: /)).toBeVisible({ timeout: 15_000 });

    // --- Create Deal (AC-013) --- Lead Detail's only nav link goes back to
    // /leads (no direct "/" link), so jump straight to /deals instead.
    await page.goto('/deals');
    await page.click('button:has-text("+ New Deal")');
    await page.fill('input[placeholder="Deal title"]', 'Jane Prospect Deal');
    await page.fill('input[placeholder="Value"]', '5000');
    await page.click('button:has-text("Create")');
    await expect(page.getByRole('link', { name: 'Jane Prospect Deal' })).toBeVisible();

    // --- Pipeline Movement (AC-014) ---
    await page.click('a[href="/pipeline"]');
    const dealCard = page.getByRole('link', { name: 'Jane Prospect Deal' }).locator('xpath=..');
    const stageSelect = dealCard.getByLabel('Move Jane Prospect Deal');
    const currentLabel = (await stageSelect.locator('option:checked').textContent())?.trim();
    const stageOptions = await stageSelect.locator('option').allTextContents();
    const nextStage = stageOptions.find((s) => !s.includes('Won') && !s.includes('Lost') && s.trim() !== currentLabel);
    expect(nextStage).toBeTruthy();
    await stageSelect.selectOption({ label: nextStage! });

    // --- AI Follow-up Email Draft (AC-017) ---
    await page.goto('/leads');
    await page.click('text=Jane Prospect');
    await page.click('button:has-text("Generate Follow-up Email")');
    await expect(page.getByText('Status: DRAFT')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Mark as Sent')).toBeVisible();

    // --- The LEAD_CREATED automation actually executed (AC-020): the Task
    // it creates shows up in this lead's own Tasks panel. ---
    await expect(page.getByText('Create Follow-up Task on New Lead')).toBeVisible();

    // --- Dashboard (AC-021) reflects the new totals, no zero-lead empty
    // state banner anymore. --- (same reason: jump directly, Lead Detail
    // has no "/" link)
    await page.goto('/dashboard');
    await expect(page.getByText('No leads yet —')).toHaveCount(0);
    const totalLeadsValue = page.locator('span', { hasText: 'Total Leads' }).locator('xpath=following-sibling::span[1]');
    await expect(totalLeadsValue).not.toHaveText('0');
  });
});
