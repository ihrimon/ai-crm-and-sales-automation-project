import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-048. Audit scope for M8: OrganizationMember (invite/update/remove),
// Lead (create/update/delete), Deal (create/update/move-as-update) — see
// docs/development-plan/README.md §M8. GET /audit-logs is OWNER/ADMIN/VIEWER
// only (docs/api/openapi.yaml).
describe('Audit logs (integration)', () => {
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

  async function logsFor(accessToken: string, entityType: string, entityId: string) {
    const res = await request(server)
      .get(`/api/v1/audit-logs?entityType=${entityType}&entityId=${entityId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body.data;
  }

  it('records a CREATE + UPDATE + DELETE trail for a Lead', async () => {
    const { owner } = await setupOrg('audit-lead');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Prospect' }).expect(201);

    await request(server)
      .patch(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Updated' })
      .expect(200);

    await request(server).delete(`/api/v1/leads/${lead.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(204);

    const logs = await logsFor(owner.accessToken, 'Lead', lead.body.id);
    expect(logs.map((l: { action: string }) => l.action).sort()).toEqual(['CREATE', 'DELETE', 'UPDATE']);
    const createLog = logs.find((l: { action: string }) => l.action === 'CREATE');
    expect(createLog.newValue).toMatchObject({ name: 'Jane Prospect' });
    expect(createLog.oldValue).toBeNull();
  });

  it('records a CREATE + UPDATE trail for a Deal, including move()', async () => {
    const { owner } = await setupOrg('audit-deal');
    const pipelines = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    const stages = await request(server).get(`/api/v1/pipelines/${pipelines.body[0].id}/stages`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    const open = stages.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost);
    const won = stages.body.find((s: { isWon: boolean }) => s.isWon);

    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Big Deal', pipelineStageId: open.id })
      .expect(201);

    await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: won.id })
      .expect(200);

    const logs = await logsFor(owner.accessToken, 'Deal', deal.body.id);
    expect(logs.map((l: { action: string }) => l.action).sort()).toEqual(['CREATE', 'UPDATE']);
  });

  it('records a CREATE trail for an invited OrganizationMember and never exposes passwordHash', async () => {
    const { organizationId, owner } = await setupOrg('audit-member');
    const rep = await addMember(organizationId, owner.accessToken, 'audit-member-rep', 'SALES_REP');

    const logs = await logsFor(owner.accessToken, 'OrganizationMember', rep.memberId);
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('CREATE');
    expect(JSON.stringify(logs[0])).not.toMatch(/passwordHash/i);
  });

  it('GET /audit-logs is OWNER/ADMIN/VIEWER only — SALES_MANAGER and SALES_REP get 403', async () => {
    const { organizationId, owner } = await setupOrg('audit-rbac');
    const manager = await addMember(organizationId, owner.accessToken, 'audit-rbac-mgr', 'SALES_MANAGER');
    const rep = await addMember(organizationId, owner.accessToken, 'audit-rbac-rep', 'SALES_REP');
    const viewer = await addMember(organizationId, owner.accessToken, 'audit-rbac-v', 'VIEWER');

    await request(server).get('/api/v1/audit-logs').set('Authorization', `Bearer ${manager.session.accessToken}`).expect(403);
    await request(server).get('/api/v1/audit-logs').set('Authorization', `Bearer ${rep.session.accessToken}`).expect(403);
    await request(server).get('/api/v1/audit-logs').set('Authorization', `Bearer ${viewer.session.accessToken}`).expect(200);
  });
});
