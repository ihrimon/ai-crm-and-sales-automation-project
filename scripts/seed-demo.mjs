#!/usr/bin/env node
// Seeds a ready-to-explore demo organization through the real HTTP API (not
// direct DB writes), so tenancy/RLS, round-robin assignment, automations,
// notifications and the audit trail all fire exactly as they do for a real
// user. Works against local dev or a deployed API:
//
//   node scripts/seed-demo.mjs                      # http://localhost:34001/api/v1
//   SEED_API_URL=https://<api-host>/api/v1 node scripts/seed-demo.mjs
//
// Idempotent: if the demo owner can already log in, it exits without touching
// anything. The credentials below are intentionally public (they're printed
// in the README) — the demo org is a sandbox, not a place for real data.

const API_URL = (process.env.SEED_API_URL ?? 'http://localhost:34001/api/v1').replace(/\/$/, '');

const OWNER = { email: 'demo@ai-crm-demo.app', password: 'DemoCRM2026!' };
const REP = { email: 'rep@ai-crm-demo.app', password: 'DemoCRM2026!' };
const REP2 = { email: 'rep2@ai-crm-demo.app', password: 'DemoCRM2026!' };
const ORG = { name: 'Northwind Growth Agency', slug: 'northwind-demo' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const daysFromNow = (days) => new Date(Date.now() + days * 86_400_000).toISOString();

async function call(method, path, { token, body, allow } = {}) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // The API rate-limits per IP (100 req/60s by default) — wait it out rather than fail.
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 10);
      console.log(`  rate limited, waiting ${wait}s...`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok && !(allow ?? []).includes(res.status)) {
      throw new Error(`${method} ${path} -> ${res.status} ${text}`);
    }
    return { status: res.status, body: json };
  }
  throw new Error(`${method} ${path}: still rate limited after retries`);
}

async function login(account) {
  const res = await call('POST', '/auth/login', { body: account, allow: [401] });
  return res.status === 200 ? res.body : null;
}

async function registerAndLogin(account) {
  await call('POST', '/auth/register', { body: account });
  return login(account);
}

async function main() {
  console.log(`Seeding demo data into ${API_URL}`);

  if (await login(OWNER)) {
    console.log('Demo owner already exists — nothing to do.');
    return;
  }

  // --- accounts + organization --------------------------------------------
  await registerAndLogin(REP);
  await registerAndLogin(REP2);
  let owner = await registerAndLogin(OWNER);
  await call('POST', '/organizations', { token: owner.accessToken, body: ORG });
  // The token issued at login predates the org; refresh picks up the membership.
  owner = await call('POST', '/auth/refresh', { body: { refreshToken: owner.refreshToken } }).then((r) => r.body);
  const token = owner.accessToken;

  const me = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const orgId = me.organizationId;
  const ownerMemberId = me.memberId;
  for (const account of [REP, REP2]) {
    await call('POST', `/organizations/${orgId}/members`, { token, body: { email: account.email, role: 'SALES_REP' } });
  }
  console.log('Created org, owner, and two sales reps.');

  const pipelines = (await call('GET', '/pipelines', { token })).body;
  const pipelineId = pipelines[0].id;
  const stageList = (await call('GET', `/pipelines/${pipelineId}/stages`, { token })).body;
  const stage = Object.fromEntries(stageList.map((s) => [s.name, s.id]));

  // --- automations first, so the records created below actually trigger them
  const automations = [
    { name: 'Notify owner on every new lead', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' },
    { name: 'Follow-up task when a deal is won', triggerType: 'DEAL_WON', actionType: 'CREATE_TASK' },
    {
      name: 'AI review when a deal reaches Proposal',
      triggerType: 'DEAL_STAGE_CHANGED',
      conditionJson: { field: 'stageName', operator: 'eq', value: 'Proposal' },
      actionType: 'CALL_AI',
    },
    {
      name: 'Nudge on leads silent for 3+ days',
      triggerType: 'NO_RESPONSE',
      conditionJson: { field: 'daysSinceContact', operator: 'gte', value: 3 },
      actionType: 'NOTIFY',
    },
  ];
  for (const automation of automations) {
    await call('POST', '/automations', { token, body: automation });
  }
  console.log(`Created ${automations.length} automations.`);

  // --- companies & contacts -----------------------------------------------
  const companySeeds = [
    { name: 'Helix Robotics', website: 'https://helixrobotics.example', industry: 'Manufacturing', companySize: '201-500' },
    { name: 'Brightwave Media', website: 'https://brightwave.example', industry: 'Marketing', companySize: '51-200' },
    { name: 'Lumen Health', website: 'https://lumenhealth.example', industry: 'Healthcare', companySize: '501-1000' },
    { name: 'Orbit Logistics', website: 'https://orbitlogistics.example', industry: 'Logistics', companySize: '201-500' },
    { name: 'Tidewater Finance', website: 'https://tidewater.example', industry: 'Finance', companySize: '1001-5000' },
    { name: 'Sprout Learning', website: 'https://sproutlearning.example', industry: 'Education', companySize: '11-50' },
  ];
  const companies = [];
  for (const seed of companySeeds) companies.push((await call('POST', '/companies', { token, body: seed })).body);

  const contactSeeds = [
    { name: 'Priya Nair', email: 'priya.nair@helixrobotics.example', position: 'VP Operations', preferredChannel: 'email', company: 0 },
    { name: 'Marcus Webb', email: 'marcus.webb@brightwave.example', position: 'Head of Growth', preferredChannel: 'phone', company: 1 },
    { name: 'Elena Rossi', email: 'elena.rossi@lumenhealth.example', position: 'CIO', preferredChannel: 'email', company: 2 },
    { name: 'Tomás Herrera', email: 'tomas.herrera@orbitlogistics.example', position: 'Director of Supply Chain', preferredChannel: 'email', company: 3 },
    { name: 'Aisha Khan', email: 'aisha.khan@tidewater.example', position: 'Chief Revenue Officer', preferredChannel: 'phone', company: 4 },
    { name: 'Jonas Lindqvist', email: 'jonas@sproutlearning.example', position: 'Founder', preferredChannel: 'email', company: 5 },
  ];
  const contacts = [];
  for (const { company, ...seed } of contactSeeds) {
    contacts.push((await call('POST', '/contacts', { token, body: { ...seed, companyId: companies[company].id } })).body);
  }
  console.log(`Created ${companies.length} companies and ${contacts.length} contacts.`);

  // --- leads ----------------------------------------------------------------
  const leadSeeds = [
    { name: 'Priya Nair', email: 'priya.nair@helixrobotics.example', source: 'Webinar', industry: 'Manufacturing', jobTitle: 'VP Operations', budget: 48000, c: 0, status: 'QUALIFIED' },
    { name: 'Marcus Webb', email: 'marcus.webb@brightwave.example', source: 'Referral', industry: 'Marketing', jobTitle: 'Head of Growth', budget: 22000, c: 1, status: 'CONTACTED' },
    { name: 'Elena Rossi', email: 'elena.rossi@lumenhealth.example', source: 'Website', industry: 'Healthcare', jobTitle: 'CIO', budget: 95000, c: 2, status: 'QUALIFIED' },
    { name: 'Tomás Herrera', email: 'tomas.herrera@orbitlogistics.example', source: 'LinkedIn', industry: 'Logistics', jobTitle: 'Director of Supply Chain', budget: 36000, c: 3, status: 'CONTACTED' },
    { name: 'Aisha Khan', email: 'aisha.khan@tidewater.example', source: 'Conference', industry: 'Finance', jobTitle: 'Chief Revenue Officer', budget: 150000, c: 4, status: 'QUALIFIED' },
    { name: 'Jonas Lindqvist', email: 'jonas@sproutlearning.example', source: 'Cold outreach', industry: 'Education', jobTitle: 'Founder', budget: 8000, c: 5, status: 'NEW' },
    { name: 'Dana Whitfield', email: 'dana.whitfield@example.com', source: 'Website', industry: 'Retail', jobTitle: 'Operations Manager', budget: 12000, status: 'NEW' },
    { name: 'Rahul Mehta', email: 'rahul.mehta@example.com', source: 'Webinar', industry: 'SaaS', jobTitle: 'Product Lead', budget: 30000, status: 'CONTACTED' },
    { name: 'Chloe Martin', email: 'chloe.martin@example.com', source: 'Referral', industry: 'Marketing', jobTitle: 'Agency Owner', budget: 18000, status: 'UNQUALIFIED' },
    { name: 'Ben Okafor', email: 'ben.okafor@example.com', source: 'LinkedIn', industry: 'Finance', jobTitle: 'Analyst', budget: 5000, status: 'LOST', lostReason: 'Budget frozen until next fiscal year' },
    { name: 'Sofia Alvarez', email: 'sofia.alvarez@example.com', source: 'Conference', industry: 'Healthcare', jobTitle: 'Clinic Director', budget: 27000, status: 'NEW' },
    { name: 'Liam Foster', email: 'liam.foster@example.com', source: 'Website', industry: 'Logistics', jobTitle: 'Fleet Manager', budget: 41000, status: 'QUALIFIED' },
  ];
  const leads = [];
  const ownedByOwner = new Set([0, 2, 4, 7]); // key accounts; the rest fall through to round-robin
  for (const [index, { c, status, lostReason, ...seed }] of leadSeeds.entries()) {
    const body = {
      ...seed,
      ...(c !== undefined ? { contactId: contacts[c].id, companyId: companies[c].id } : {}),
      ...(ownedByOwner.has(index) ? { ownerId: ownerMemberId } : {}),
    };
    const lead = (await call('POST', '/leads', { token, body })).body;
    if (status !== 'NEW') {
      await call('PATCH', `/leads/${lead.id}`, { token, body: { status, ...(lostReason ? { lostReason } : {}) } });
    }
    leads.push(lead);
  }
  console.log(`Created ${leads.length} leads (key accounts owned by the owner, the rest round-robin between the two reps).`);

  // --- deals, spread across the pipeline -------------------------------------
  const dealSeeds = [
    { title: 'Helix Robotics — Ops automation rollout', value: 48000, probability: 60, lead: 0, c: 0, moveTo: ['Contacted', 'Meeting', 'Proposal'] },
    { title: 'Lumen Health — Patient intake CRM', value: 95000, probability: 40, lead: 2, c: 2, moveTo: ['Contacted', 'Meeting'] },
    { title: 'Tidewater Finance — Revenue team platform', value: 150000, probability: 70, lead: 4, c: 4, moveTo: ['Contacted', 'Meeting', 'Proposal', 'Negotiation'] },
    { title: 'Brightwave Media — Lead scoring pilot', value: 22000, probability: 30, lead: 1, c: 1, moveTo: ['Contacted'] },
    { title: 'Orbit Logistics — Dispatch follow-up sequences', value: 36000, probability: 50, lead: 3, c: 3, moveTo: ['Contacted', 'Meeting'] },
    { title: 'Sprout Learning — Starter plan', value: 8000, probability: 90, lead: 5, c: 5, moveTo: ['Contacted', 'Meeting', 'Proposal', 'Negotiation', 'Won'] },
    { title: 'Fleet Manager onboarding — Foster', value: 41000, probability: 20, lead: 11, moveTo: [] },
    { title: 'Retail ops audit — Whitfield', value: 12000, probability: 10, lead: 6, moveTo: ['Contacted', 'Lost'], lostReason: 'Chose an in-house spreadsheet workflow' },
  ];
  for (const seed of dealSeeds) {
    const deal = (
      await call('POST', '/deals', {
        token,
        body: {
          title: seed.title,
          value: seed.value,
          currency: 'USD',
          probability: seed.probability,
          expectedCloseDate: daysFromNow(14 + Math.floor(Math.random() * 45)),
          pipelineStageId: stage.Qualified,
          leadId: leads[seed.lead].id,
          ...(seed.c !== undefined ? { contactId: contacts[seed.c].id, companyId: companies[seed.c].id } : {}),
        },
      })
    ).body;
    for (const stageName of seed.moveTo) {
      await call('POST', `/deals/${deal.id}/move`, {
        token,
        body: { pipelineStageId: stage[stageName], ...(stageName === 'Lost' ? { lostReason: seed.lostReason } : {}) },
      });
    }
  }
  console.log(`Created ${dealSeeds.length} deals across the pipeline.`);

  // --- activities & tasks ----------------------------------------------------
  const activitySeeds = [
    { type: 'CALL', notes: 'Intro call. Priya wants to cut manual dispatch reporting; open to a pilot next quarter.', lead: 0 },
    { type: 'EMAIL', notes: 'Sent the case study and pricing overview. Asked for a technical contact.', lead: 0 },
    { type: 'MEETING', notes: 'Demo with the Lumen Health IT team. Compliance questions around data residency.', lead: 2 },
    { type: 'NOTE', notes: 'Elena is the champion; procurement needs a security questionnaire before signing.', lead: 2 },
    { type: 'CALL', notes: 'Aisha confirmed budget approved. Wants a 5-seat pilot then expand to 40 seats.', lead: 4 },
    { type: 'EMAIL', notes: 'Sent the revised proposal with volume pricing.', lead: 4 },
    { type: 'CALL', notes: 'Marcus asked whether lead scoring works with their existing HubSpot export.', lead: 1 },
    { type: 'MEETING', notes: 'Kickoff scoping call with Orbit Logistics; mapping their follow-up cadence.', lead: 3 },
    { type: 'NOTE', notes: 'Ben is out for now. Revisit in Q1 when budgets reset.', lead: 9 },
  ];
  for (const { lead, ...seed } of activitySeeds) {
    await call('POST', '/activities', { token, body: { ...seed, leadId: leads[lead].id, occurredAt: daysFromNow(-Math.ceil(Math.random() * 6)) } });
  }

  const taskSeeds = [
    { title: 'Send security questionnaire to Lumen Health', due: 2, lead: 2 },
    { title: 'Prepare volume-pricing addendum for Tidewater', due: 1, lead: 4 },
    { title: 'Schedule technical deep-dive with Helix Robotics', due: 4, lead: 0 },
    { title: 'Follow up with Marcus about the HubSpot export', due: -1, lead: 1 },
    { title: 'Draft onboarding plan for Sprout Learning', due: 5, lead: 5 },
    { title: 'Re-engage Ben Okafor in January', due: 90, lead: 9 },
  ];
  for (const { lead, due, title } of taskSeeds) {
    await call('POST', '/tasks', { token, body: { title, dueDate: daysFromNow(due), leadId: leads[lead].id } });
  }
  console.log(`Logged ${activitySeeds.length} activities and ${taskSeeds.length} tasks.`);

  // --- AI analyses & an email draft (async; the worker fills them in) -------
  // Every lead gets a score (it also lands on Lead.score, which the Leads list and
  // Dashboard show); a few also get a qualification or summary for the AI panel.
  const analyses = [...leads.keys()].map((lead) => [lead, 'SCORE']);
  analyses.push([4, 'QUALIFICATION'], [2, 'QUALIFICATION'], [2, 'SUMMARY'], [0, 'SUMMARY']);
  for (const [lead, type] of analyses) {
    await call('POST', `/leads/${leads[lead].id}/ai-analyses`, { token, body: { type } });
  }
  await call('POST', `/leads/${leads[4].id}/email-drafts`, { token, body: { tone: 'professional' } });
  console.log('Queued AI scores for every lead, plus qualifications, summaries, and an email draft.');

  await sleep(3000);
  console.log('\nDone. Sign in with:');
  console.log(`  owner  ${OWNER.email} / ${OWNER.password}   (full access)`);
  console.log(`  rep    ${REP.email} / ${REP.password}   (sales rep)`);
  console.log(`  rep 2  ${REP2.email} / ${REP2.password}   (sales rep)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
