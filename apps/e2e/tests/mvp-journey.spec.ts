import { expect, test } from '@playwright/test';
import { apiRegisterAndLogin, ERROR_ALERT_SELECTOR, PASSWORD, selectRadixOption, uniqueEmail, uniqueSlug } from './helpers';

// The flagship E2E test — mirrors docs/srs/08-acceptance-criteria.md §15
// "Final MVP Acceptance" literally: Register -> CreateOrg -> Invite ->
// CreateLead -> Assign -> Qualify -> Score -> CreateDeal -> Move -> Draft ->
// Automation -> Dashboard. One deliberate reordering vs. that diagram: the
// Automation step is created right after Invite, before CreateLead, not
// near the end — an automation has to be *configured* before the event
// it's listening for happens, so "create a LEAD_CREATED automation" must
// precede "create a lead" for it to actually fire (the diagram describes
// which capabilities the MVP must demonstrate, not a strict click order).
//
// Updated 2026-09-18 for the 2026-09-17 shadcn/ui redesign — see
// docs/security-review/README.md for what changed and why (nav model,
// Dialog-based create forms, Radix Select, tabbed Lead Detail panel, and a
// sample-data fallback on every list screen when the real result is empty).
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

    // --- Create Organization (AC-004) --- onboarding pushes straight to
    // /dashboard now (no more bounce through a shared "/" hub).
    const orgName = `E2E MVP Org ${uniqueSlug('')}`;
    await page.fill('#name', orgName);
    await page.click('button[type=submit]');
    await page.waitForURL((url) => url.pathname === '/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // --- Invite a teammate (AC-005) — the invitee needs an existing account
    // first (no email provider exists yet, docs/development-plan/README.md
    // §M1), so the rep registers via the API, not through this UI. The
    // persistent sidebar means every section is a direct link now — no need
    // to route back through a shared homepage between actions.
    const rep = await apiRegisterAndLogin(request, 'e2e-mvp-rep');
    await page.click('a[href="/team"]');
    const inviteForm = page.locator('form', { has: page.locator('input[placeholder="email@example.com"]') });
    await inviteForm.locator('input[type=email]').fill(rep.email);
    await selectRadixOption(inviteForm.locator('button[role="combobox"]'), 'Sales Rep');
    await inviteForm.locator('button:has-text("Invite")').click();
    await expect(page.locator(ERROR_ALERT_SELECTOR)).toHaveCount(0);

    // --- Create an automation before the event it reacts to (AC-019) ---
    await page.click('a[href="/automations"]');
    await page.click('button:has-text("New Automation")');
    await page.fill('#autoName', 'Create Follow-up Task on New Lead');
    // Default trigger/action selects are already LEAD_CREATED / CREATE_TASK.
    await page.click('button:text-is("Create")');
    await expect(page.getByText('Create Follow-up Task on New Lead')).toBeVisible();

    // --- Create Lead (AC-008) — this also fires the automation above ---
    await page.click('a[href="/leads"]');
    await page.click('button:has-text("New Lead")');
    await page.fill('#newName', 'Jane Prospect');
    await page.click('button:text-is("Create")');
    await expect(page.getByRole('link', { name: 'Jane Prospect' })).toBeVisible();
    await page.click('text=Jane Prospect');
    await page.waitForURL(/\/leads\/.+/);

    // --- Assign (AC-010) — the UI control this E2E pass added (Phase 15
    // found docs/ui-ux/README.md §5.3's "[Assign]*" wireframe control had
    // never actually been wired up on Lead Detail; see
    // docs/testing-plan/README.md for the fix). The role select and the
    // member picker are both Radix `Select`s now, not native <select>s. ---
    const assignTrigger = page.locator('#assignToId');
    await assignTrigger.click();
    const repOption = page.getByRole('option', { name: /\(SALES_REP\)/ });
    const repOptionText = (await repOption.textContent())?.trim();
    expect(repOptionText).toBeTruthy();
    await repOption.click();
    await page.click('button:has-text("Assign")');
    await expect(page.locator(ERROR_ALERT_SELECTOR)).toHaveCount(0);

    // --- AI Qualification (AC-016) then AI Lead Scoring (AC-015) — the
    // stub provider (no ANTHROPIC_API_KEY configured) is deterministic and
    // fast, but this still exercises the real 202-then-poll BullMQ flow.
    // Both live in the "AI" tab, which is the Lead Detail panel's default. ---
    await page.click('button:has-text("Qualify with AI")');
    // Qualify's stub result only ever carries {classification, reasons} — no
    // recommendedAction (that's Score-only) — so check the classification
    // badge itself (components/ai-panel.tsx), not a field that isn't there.
    await expect(page.getByText(/^(High|Medium|Low)$/)).toBeVisible({ timeout: 30_000 });
    await page.click('button:has-text("Score with AI")');
    await expect(page.getByText(/\/ 100/)).toBeVisible({ timeout: 30_000 });

    // --- Create Deal (AC-013) --- Lead Detail has no direct nav link to any
    // other section (the sidebar covers that instead), so use it directly.
    await page.click('a[href="/deals"]');
    await page.click('button:has-text("New Deal")');
    await page.fill('#newTitle', 'Jane Prospect Deal');
    await page.fill('#newValue', '5000');
    await page.click('button:text-is("Create")');
    await expect(page.getByRole('link', { name: 'Jane Prospect Deal' })).toBeVisible();

    // --- Pipeline Movement (AC-014) --- the per-card stage picker is a
    // Radix Select (button[role=combobox] + a portal-rendered listbox), not
    // a native <select> — open it, read the current/available option text,
    // then pick anything that isn't the current stage or a terminal one.
    await page.click('a[href="/pipeline"]');
    const dealCard = page.locator('.shadow-none', { has: page.getByRole('link', { name: 'Jane Prospect Deal' }) });
    const stageTrigger = dealCard.locator('button[role="combobox"]');
    const currentLabel = (await stageTrigger.textContent())?.trim();
    await stageTrigger.click();
    const stageOptionTexts = await page.getByRole('option').allTextContents();
    const nextStage = stageOptionTexts.find((s) => !s.includes('Won') && !s.includes('Lost') && s.trim() !== currentLabel);
    expect(nextStage).toBeTruthy();
    await page.getByRole('option', { name: nextStage!, exact: true }).click();

    // --- AI Follow-up Email Draft (AC-017) --- a hard navigation here
    // (not a sidebar click) sidesteps a real flake: right after picking a
    // Radix Select option, its closing portal can still intercept the very
    // next click for a moment, and 'text=Jane Prospect' is a substring
    // match — if the sidebar click were swallowed, it would silently
    // re-match "Jane Prospect Deal" still on screen and open the Deal, not
    // the Lead, page.
    await page.goto('/leads');
    await page.click('text="Jane Prospect"');
    await page.click('button:has-text("Generate follow-up email")');
    await expect(page.getByText('DRAFT', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /mark as sent/i })).toBeVisible();

    // --- The LEAD_CREATED automation actually executed (AC-020): the Task
    // it creates shows up in this lead's own Tasks panel — a tab now, not
    // an always-visible section, so switch to it first. ---
    await page.getByRole('tab', { name: 'Tasks' }).click();
    await expect(page.getByText('Create Follow-up Task on New Lead')).toBeVisible();

    // --- Dashboard (AC-021) reflects the new totals — the old "zero-lead
    // empty state banner" is now a "Sample data" badge shown only while the
    // real totals are still zero; it should be gone once a real lead
    // exists. ---
    await page.click('a[href="/dashboard"]');
    await expect(page.getByText('Sample data')).toHaveCount(0);
    const totalLeadsValue = page.locator('a[href="/leads"] .text-2xl');
    await expect(totalLeadsValue).not.toHaveText('0');
  });
});
