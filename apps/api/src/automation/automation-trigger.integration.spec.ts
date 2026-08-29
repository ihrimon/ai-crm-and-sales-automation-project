import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-043, UC-011. The M7 Definition of Done: a plain rule-based action
// executes immediately while an AI-triggered action lands in
// PENDING_APPROVAL and does nothing further until approved/rejected
// (architecture/README.md §6.3). Trigger firing happens inside the same
// request/transaction as the Lead/Deal write that caused it (LeadService.
// create(), DealService.update()/move()), so by the time the HTTP response
// comes back the resulting AutomationExecution already exists — no polling
// needed, unlike M6's AI flow.
describe('Automation trigger evaluation (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];
  const emailsToClean: string[] = [];
  const orgsToClean: string[] = [];

  beforeAll(async () => {
    ({ app, prisma } = await bootstrapTestApp());
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: orgsToClean } } });
    await prisma.user.deleteMany({ where: { email: { in: emailsToClean } } });
    await app.close();
  });

  async function setupOrg(name: string) {
    const owner = await registerAndLogin(server, `${name}-o`);
    emailsToClean.push(owner.email);
    const { organizationId, owner: refreshedOwner } = await createOrgAndRefresh(server, owner, name);
    orgsToClean.push(organizationId);
    return { organizationId, owner: refreshedOwner };
  }

  async function createAutomation(accessToken: string, body: Record<string, unknown>) {
    const res = await request(server).post('/api/v1/automations').set('Authorization', `Bearer ${accessToken}`).send(body).expect(201);
    return res.body;
  }

  async function executionsFor(accessToken: string, automationId: string) {
    const res = await request(server).get('/api/v1/automation-executions').set('Authorization', `Bearer ${accessToken}`).expect(200);
    return res.body.data.filter((e: { automationId: string }) => e.automationId === automationId);
  }

  it('a plain rule action (CREATE_TASK) executes immediately on LEAD_CREATED, no approval step', async () => {
    const { owner } = await setupOrg('trigger-rule');
    const automation = await createAutomation(owner.accessToken, {
      name: 'Create Follow-up Task',
      triggerType: 'LEAD_CREATED',
      actionType: 'CREATE_TASK',
    });

    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Prospect' }).expect(201);

    const executions = await executionsFor(owner.accessToken, automation.id);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ status: 'EXECUTED', triggeredByType: 'RULE', leadId: lead.body.id });
    expect(executions[0].resultJson.taskId).toBeDefined();

    const tasks = await request(server).get(`/api/v1/tasks?leadId=${lead.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    expect(tasks.body.data).toHaveLength(1);
    expect(tasks.body.data[0].title).toBe('Create Follow-up Task');
  });

  it('an AI-derived action (CALL_AI) lands in PENDING_APPROVAL and does nothing further (FR-052 🔎, the key M7 behavior)', async () => {
    const { owner } = await setupOrg('trigger-ai');
    const automation = await createAutomation(owner.accessToken, {
      name: 'AI Follow-up Email',
      triggerType: 'LEAD_CREATED',
      actionType: 'CALL_AI',
    });

    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Prospect' }).expect(201);

    const executions = await executionsFor(owner.accessToken, automation.id);
    expect(executions).toHaveLength(1);
    expect(executions[0]).toMatchObject({ status: 'PENDING_APPROVAL', triggeredByType: 'AI', leadId: lead.body.id });
    expect(executions[0].resultJson).toBeNull();
    expect(executions[0].reviewedById).toBeNull();
  });

  it('a non-matching condition never creates an execution', async () => {
    const { owner } = await setupOrg('trigger-condition');
    const automation = await createAutomation(owner.accessToken, {
      name: 'High Budget Only',
      triggerType: 'LEAD_CREATED',
      actionType: 'NOTIFY',
      conditionJson: { field: 'budget', operator: 'gte', value: 100000 },
    });

    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Low Budget Lead', budget: 500 }).expect(201);
    expect(await executionsFor(owner.accessToken, automation.id)).toHaveLength(0);

    const matchingLead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'High Budget Lead', budget: 250000 })
      .expect(201);
    const executions = await executionsFor(owner.accessToken, automation.id);
    expect(executions).toHaveLength(1);
    expect(executions[0].leadId).toBe(matchingLead.body.id);
  });

  it('an inactive automation never fires', async () => {
    const { owner } = await setupOrg('trigger-inactive');
    const automation = await createAutomation(owner.accessToken, {
      name: 'Disabled',
      triggerType: 'LEAD_CREATED',
      actionType: 'NOTIFY',
      isActive: false,
    });

    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);
    expect(await executionsFor(owner.accessToken, automation.id)).toHaveLength(0);
  });

  it('DEAL_STAGE_CHANGED fires on move(), and DEAL_WON additionally fires when the destination stage isWon', async () => {
    const { owner } = await setupOrg('trigger-deal');
    const stageChanged = await createAutomation(owner.accessToken, { name: 'Any Stage Change', triggerType: 'DEAL_STAGE_CHANGED', actionType: 'NOTIFY' });
    const dealWon = await createAutomation(owner.accessToken, { name: 'Deal Won Task', triggerType: 'DEAL_WON', actionType: 'CREATE_TASK' });

    const pipelines = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    const stages = await request(server).get(`/api/v1/pipelines/${pipelines.body[0].id}/stages`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    const open = stages.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost);
    const won = stages.body.find((s: { isWon: boolean }) => s.isWon);

    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Big Deal', pipelineStageId: open.id })
      .expect(201);
    // Deal creation itself is not a trigger type — no executions expected yet.
    expect(await executionsFor(owner.accessToken, stageChanged.id)).toHaveLength(0);

    await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: won.id })
      .expect(200);

    expect(await executionsFor(owner.accessToken, stageChanged.id)).toHaveLength(1);
    expect(await executionsFor(owner.accessToken, dealWon.id)).toHaveLength(1);
  });
});
