import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-027–FR-029. A Pipeline is auto-seeded per organization at creation time
// (OrganizationService.create(), M4 — no POST /pipelines exists in the
// contract), with a default set of stages ending in Won/Lost.
describe('Pipelines (integration)', () => {
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

  async function getDefaultPipeline(accessToken: string) {
    const res = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(res.body).toHaveLength(1);
    return res.body[0];
  }

  it('auto-seeds exactly one default pipeline with stages ending in Won/Lost when an org is created', async () => {
    const { owner } = await setupOrg('pipe-seed');
    const pipeline = await getDefaultPipeline(owner.accessToken);
    expect(pipeline.isDefault).toBe(true);

    const stagesRes = await request(server)
      .get(`/api/v1/pipelines/${pipeline.id}/stages`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(stagesRes.body.length).toBeGreaterThanOrEqual(3);
    expect(stagesRes.body.some((s: { isWon: boolean }) => s.isWon)).toBe(true);
    expect(stagesRes.body.some((s: { isLost: boolean }) => s.isLost)).toBe(true);
  });

  it('lets OWNER/ADMIN create and update stages, but rejects SALES_REP/VIEWER (AC-006 pattern reused)', async () => {
    const { organizationId, owner } = await setupOrg('pipe-rbac');
    const pipeline = await getDefaultPipeline(owner.accessToken);

    const repUser = await registerAndLogin(server, 'pipe-rbac-r');
    emailsToClean.push(repUser.email);
    const { session: rep } = await inviteAndRefresh(server, owner.accessToken, organizationId, repUser, 'SALES_REP');

    await request(server)
      .post(`/api/v1/pipelines/${pipeline.id}/stages`)
      .set('Authorization', `Bearer ${rep.accessToken}`)
      .send({ name: 'Custom Stage', order: 99 })
      .expect(403);

    const created = await request(server)
      .post(`/api/v1/pipelines/${pipeline.id}/stages`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Custom Stage', order: 99 })
      .expect(201);

    await request(server)
      .patch(`/api/v1/pipelines/${pipeline.id}/stages/${created.body.id}`)
      .set('Authorization', `Bearer ${rep.accessToken}`)
      .send({ name: 'Hijacked' })
      .expect(403);

    const updated = await request(server)
      .patch(`/api/v1/pipelines/${pipeline.id}/stages/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Renamed Stage' })
      .expect(200);
    expect(updated.body.name).toBe('Renamed Stage');
  });

  it("cannot read another organization's pipeline or stages (AC-007 pattern reused)", async () => {
    const { owner: ownerA } = await setupOrg('pipe-cross-a');
    const { owner: ownerB } = await setupOrg('pipe-cross-b');
    const pipelineB = await getDefaultPipeline(ownerB.accessToken);

    await request(server)
      .get(`/api/v1/pipelines/${pipelineB.id}/stages`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .expect(404);
  });

  it('computes pipeline metrics from real deals (FR-029)', async () => {
    const { owner } = await setupOrg('pipe-metrics');
    const pipeline = await getDefaultPipeline(owner.accessToken);
    const stagesRes = await request(server)
      .get(`/api/v1/pipelines/${pipeline.id}/stages`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    const openStage = stagesRes.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost);
    const wonStage = stagesRes.body.find((s: { isWon: boolean }) => s.isWon);

    await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Open Deal', value: 1000, pipelineStageId: openStage.id })
      .expect(201);
    await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Won Deal', value: 5000, pipelineStageId: wonStage.id })
      .expect(201);

    const metrics = await request(server)
      .get(`/api/v1/pipelines/${pipeline.id}/metrics`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    expect(metrics.body.totalValue).toBe(1000); // excludes the Won deal
    expect(metrics.body.countByStage[openStage.id]).toBe(1);
    expect(metrics.body.countByStage[wonStage.id]).toBe(1);
  });
});
