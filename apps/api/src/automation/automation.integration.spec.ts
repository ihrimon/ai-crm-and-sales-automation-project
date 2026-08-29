import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-042. AC-019: "Invalid configurations cannot be activated."
describe('Automations CRUD (integration)', () => {
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
    const { session } = await inviteAndRefresh(server, ownerToken, organizationId, user, role);
    return { session };
  }

  it('creates, reads, partially updates, and deletes an automation', async () => {
    const { owner } = await setupOrg('automation-crud');

    const created = await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        name: 'High Value Lead Task',
        triggerType: 'LEAD_CREATED',
        actionType: 'CREATE_TASK',
        conditionJson: { field: 'budget', operator: 'gte', value: 10000 },
      })
      .expect(201);
    expect(created.body.isActive).toBe(true);

    await request(server).get(`/api/v1/automations/${created.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);

    // Partial update — same M3/M4/M5 bug class check: PATCH with only one
    // field must not require resending name/triggerType/actionType.
    const updated = await request(server)
      .patch(`/api/v1/automations/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ isActive: false })
      .expect(200);
    expect(updated.body.isActive).toBe(false);
    expect(updated.body.name).toBe('High Value Lead Task');

    await request(server).delete(`/api/v1/automations/${created.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(204);
    await request(server).get(`/api/v1/automations/${created.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(404);
  });

  it('rejects a malformed conditionJson (AC-019: invalid configurations cannot be activated)', async () => {
    const { owner } = await setupOrg('automation-bad-cond');

    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Bad Condition', triggerType: 'LEAD_CREATED', actionType: 'CREATE_TASK', conditionJson: { field: 'budget', operator: 'startsWith', value: 1 } })
      .expect(400);
  });

  it('enforces RBAC: SALES_REP and VIEWER cannot manage automations at all', async () => {
    const { organizationId, owner } = await setupOrg('automation-rbac');
    const rep = await addMember(organizationId, owner.accessToken, 'automation-rbac-rep', 'SALES_REP');
    const viewer = await addMember(organizationId, owner.accessToken, 'automation-rbac-v', 'VIEWER');

    for (const session of [rep.session, viewer.session]) {
      await request(server)
        .post('/api/v1/automations')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({ name: 'x', triggerType: 'LEAD_CREATED', actionType: 'CREATE_TASK' })
        .expect(403);
      await request(server).get('/api/v1/automations').set('Authorization', `Bearer ${session.accessToken}`).expect(403);
    }
  });

  it("can't see another organization's automations", async () => {
    const { owner: ownerA } = await setupOrg('automation-crossorg-a');
    const { owner: ownerB } = await setupOrg('automation-crossorg-b');

    const createdB = await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Org B Automation', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' })
      .expect(201);

    await request(server).get(`/api/v1/automations/${createdB.body.id}`).set('Authorization', `Bearer ${ownerA.accessToken}`).expect(404);
  });
});
