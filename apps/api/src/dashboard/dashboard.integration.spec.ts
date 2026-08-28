import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-033–FR-035. AC-021, including its empty-state clause (NFR-030) for an
// organization with zero leads/deals.
describe('Dashboard (integration)', () => {
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

  it('returns all-zero metrics for a brand-new organization with zero leads/deals (NFR-030 empty state)', async () => {
    const { owner } = await setupOrg('dash-empty');

    const res = await request(server).get('/api/v1/dashboard/metrics').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    expect(res.body).toEqual({
      totalLeads: 0,
      qualifiedLeads: 0,
      openDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      pipelineValue: 0,
      conversionRate: 0,
    });
  });

  it('reflects real leads/deals, scoped only to the caller organization', async () => {
    const { owner } = await setupOrg('dash-real');
    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Lead A' }).expect(201);
    const qualifiedLead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Lead B' })
      .expect(201);
    await request(server)
      .patch(`/api/v1/leads/${qualifiedLead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'QUALIFIED' })
      .expect(200);

    const pipelines = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    const stages = await request(server)
      .get(`/api/v1/pipelines/${pipelines.body[0].id}/stages`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const open = stages.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost);
    const won = stages.body.find((s: { isWon: boolean }) => s.isWon);

    await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Open Deal', value: 1000, pipelineStageId: open.id })
      .expect(201);
    await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Won Deal', value: 2000, pipelineStageId: won.id })
      .expect(201);

    const res = await request(server).get('/api/v1/dashboard/metrics').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    expect(res.body).toMatchObject({
      totalLeads: 2,
      qualifiedLeads: 1,
      openDeals: 1,
      wonDeals: 1,
      lostDeals: 0,
      pipelineValue: 1000,
      conversionRate: 50,
    });
  });

  it("does not count another organization's leads/deals", async () => {
    const { owner: ownerA } = await setupOrg('dash-xt-a');
    const { owner: ownerB } = await setupOrg('dash-xt-b');
    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${ownerB.accessToken}`).send({ name: 'Org B Lead' }).expect(201);

    const res = await request(server).get('/api/v1/dashboard/metrics').set('Authorization', `Bearer ${ownerA.accessToken}`).expect(200);
    expect(res.body.totalLeads).toBe(0);
  });
});
