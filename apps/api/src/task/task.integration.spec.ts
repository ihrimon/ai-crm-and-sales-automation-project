import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-031–FR-032.
describe('Tasks (integration)', () => {
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

  it('creates a task linked to a deal, lists it, and changes its status (AC-021 pattern)', async () => {
    const { owner } = await setupOrg('task-crud');
    const { open } = await (async () => {
      const pipelines = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
      const stages = await request(server)
        .get(`/api/v1/pipelines/${pipelines.body[0].id}/stages`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      return { open: stages.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost) };
    })();
    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Acme Deal', pipelineStageId: open.id })
      .expect(201);

    const task = await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Send proposal', dealId: deal.body.id })
      .expect(201);
    expect(task.body.status).toBe('OPEN');

    const list = await request(server)
      .get(`/api/v1/tasks?dealId=${deal.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);

    const updated = await request(server)
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'DONE' })
      .expect(200);
    expect(updated.body.status).toBe('DONE');
  });

  it('rejects a task with no relation set', async () => {
    const { owner } = await setupOrg('task-relation');
    const res = await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Untethered task' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_TASK_RELATION');
  });

  it('rejects an assignedToId that is not an active member of the organization', async () => {
    const { owner } = await setupOrg('task-owner-xt');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead' })
      .expect(201);

    const res = await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Call Jane', leadId: lead.body.id, assignedToId: '00000000-0000-0000-0000-000000000000' })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_ASSIGNED_TO_ID');
  });

  it('write is limited to the assignee or a manager-tier role: a non-assignee SALES_REP gets 403, the assignee and managers succeed', async () => {
    const { organizationId, owner } = await setupOrg('task-write-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'task-scope-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'task-scope-repb', 'SALES_REP');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead', ownerId: repA.memberId })
      .expect(201);

    const task = await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Call Jane', leadId: lead.body.id, assignedToId: repA.memberId })
      .expect(201);

    await request(server)
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${repB.session.accessToken}`)
      .send({ status: 'DONE' })
      .expect(403);

    await request(server)
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .send({ status: 'IN_PROGRESS' })
      .expect(200);

    const byOwner = await request(server)
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'DONE' })
      .expect(200);
    expect(byOwner.body.status).toBe('DONE');
  });

  it("all roles, including VIEWER, can list tasks (no ownership row-scope on read)", async () => {
    const { organizationId, owner } = await setupOrg('task-read-scope');
    const viewer = await addMember(organizationId, owner.accessToken, 'task-read-v', 'VIEWER');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead' })
      .expect(201);
    await request(server)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Call Jane', leadId: lead.body.id })
      .expect(201);

    const list = await request(server)
      .get('/api/v1/tasks')
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .expect(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(1);
  });
});
