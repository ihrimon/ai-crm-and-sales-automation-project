import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-045, FR-052 🔎. approve()/reject() are synchronous 200s (not the
// 202-then-poll pattern M6 used for ai-analyses/email-drafts) — see
// AutomationExecutionService for why.
describe('Automation execution approve/reject (integration)', () => {
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

  async function addMember(organizationId: string, ownerToken: string, namePrefix: string, role: string) {
    const user = await registerAndLogin(server, namePrefix);
    emailsToClean.push(user.email);
    const { session, memberId } = await inviteAndRefresh(server, ownerToken, organizationId, user, role);
    return { session, memberId };
  }

  async function createPendingApprovalExecution(accessToken: string, leadName = 'Jane Prospect', ownerId?: string) {
    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'AI Follow-up', triggerType: 'LEAD_CREATED', actionType: 'CALL_AI' })
      .expect(201);
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: leadName, ...(ownerId ? { ownerId } : {}) })
      .expect(201);
    const executions = await request(server).get('/api/v1/automation-executions').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const execution = executions.body.data.find((e: { leadId: string }) => e.leadId === lead.body.id);
    return { execution, leadId: lead.body.id };
  }

  it('approve() generates an email draft (via the stub AI adapter) and marks the execution EXECUTED (AC-020: execution status is logged)', async () => {
    const { owner } = await setupOrg('exec-approve');
    const { execution } = await createPendingApprovalExecution(owner.accessToken);
    expect(execution.status).toBe('PENDING_APPROVAL');

    const approved = await request(server)
      .post(`/api/v1/automation-executions/${execution.id}/approve`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(approved.body.status).toBe('EXECUTED');
    expect(approved.body.resultJson.emailDraftId).toBeDefined();
    expect(approved.body.reviewedById).toBeDefined();

    const draft = await request(server)
      .get(`/api/v1/email-drafts/${approved.body.resultJson.emailDraftId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(draft.body.status).toBe('DRAFT');
    expect(draft.body.subject).toBeTruthy();
  });

  it('reject() marks the execution DISMISSED and creates no EmailDraft', async () => {
    const { owner } = await setupOrg('exec-reject');
    const { execution } = await createPendingApprovalExecution(owner.accessToken);

    const rejected = await request(server)
      .post(`/api/v1/automation-executions/${execution.id}/reject`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(rejected.body.status).toBe('DISMISSED');
    expect(rejected.body.resultJson).toBeNull();
  });

  it('rejects (400) approving/rejecting an execution that is not PENDING_APPROVAL', async () => {
    const { owner } = await setupOrg('exec-not-pending');
    const { execution } = await createPendingApprovalExecution(owner.accessToken);
    await request(server).post(`/api/v1/automation-executions/${execution.id}/reject`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);

    await request(server).post(`/api/v1/automation-executions/${execution.id}/approve`).set('Authorization', `Bearer ${owner.accessToken}`).expect(400);
    await request(server).post(`/api/v1/automation-executions/${execution.id}/reject`).set('Authorization', `Bearer ${owner.accessToken}`).expect(400);
  });

  it('a SALES_REP only sees and can act on executions for leads/deals they own', async () => {
    const { organizationId, owner } = await setupOrg('exec-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'exec-scope-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'exec-scope-repb', 'SALES_REP');
    const { execution } = await createPendingApprovalExecution(owner.accessToken, 'Owned by A', repA.memberId);

    const listAsB = await request(server).get('/api/v1/automation-executions').set('Authorization', `Bearer ${repB.session.accessToken}`).expect(200);
    expect(listAsB.body.data.find((e: { id: string }) => e.id === execution.id)).toBeUndefined();

    await request(server).post(`/api/v1/automation-executions/${execution.id}/approve`).set('Authorization', `Bearer ${repB.session.accessToken}`).expect(404);

    const listAsA = await request(server).get('/api/v1/automation-executions').set('Authorization', `Bearer ${repA.session.accessToken}`).expect(200);
    expect(listAsA.body.data.find((e: { id: string }) => e.id === execution.id)).toBeDefined();
    await request(server).post(`/api/v1/automation-executions/${execution.id}/approve`).set('Authorization', `Bearer ${repA.session.accessToken}`).expect(200);
  });

  it('enforces RBAC: VIEWER cannot list or approve/reject executions', async () => {
    const { organizationId, owner } = await setupOrg('exec-rbac');
    const viewer = await addMember(organizationId, owner.accessToken, 'exec-rbac-v', 'VIEWER');
    const { execution } = await createPendingApprovalExecution(owner.accessToken);

    await request(server).get('/api/v1/automation-executions').set('Authorization', `Bearer ${viewer.session.accessToken}`).expect(403);
    await request(server).post(`/api/v1/automation-executions/${execution.id}/approve`).set('Authorization', `Bearer ${viewer.session.accessToken}`).expect(403);
  });
});
