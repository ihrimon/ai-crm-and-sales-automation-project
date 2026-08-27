import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-023–FR-026, FR-028. AC-013 (create), AC-014 (pipeline movement,
// including the "isLost stage without lostReason is rejected server-side"
// rule from docs/development-plan/README.md's M4 Definition of Done).
describe('Deals (integration)', () => {
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

  async function getStages(accessToken: string) {
    const pipelinesRes = await request(server).get('/api/v1/pipelines').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const pipelineId = pipelinesRes.body[0].id;
    const stagesRes = await request(server)
      .get(`/api/v1/pipelines/${pipelineId}/stages`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const open = stagesRes.body.find((s: { isWon: boolean; isLost: boolean }) => !s.isWon && !s.isLost);
    const won = stagesRes.body.find((s: { isWon: boolean }) => s.isWon);
    const lost = stagesRes.body.find((s: { isLost: boolean }) => s.isLost);
    return { pipelineId, open, won, lost };
  }

  it('creates, reads, and updates a deal linked to a lead/contact/company (AC-013)', async () => {
    const { owner } = await setupOrg('deal-crud');
    const { open } = await getStages(owner.accessToken);

    const company = await request(server).post('/api/v1/companies').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Acme' }).expect(201);
    const contact = await request(server).post('/api/v1/contacts').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane' }).expect(201);
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);

    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({
        title: 'Acme Deal',
        value: 12000,
        pipelineStageId: open.id,
        companyId: company.body.id,
        contactId: contact.body.id,
        leadId: lead.body.id,
      })
      .expect(201);
    expect(deal.body.companyId).toBe(company.body.id);
    expect(deal.body.value).toBe(12000);

    const updated = await request(server)
      .patch(`/api/v1/deals/${deal.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ value: 15000, probability: 60 })
      .expect(200);
    expect(updated.body.value).toBe(15000);
    expect(updated.body.title).toBe('Acme Deal'); // partial update, title untouched

    await request(server).get(`/api/v1/deals/${deal.body.id}`).set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
  });

  it('rejects a deal referencing a pipelineStageId/leadId/contactId/companyId/ownerId from another organization', async () => {
    const { owner } = await setupOrg('deal-xt-a');
    const { open } = await getStages(owner.accessToken);
    const { owner: otherOwner } = await setupOrg('deal-xt-b');
    const { open: otherOpen } = await getStages(otherOwner.accessToken);

    const res = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Bad Deal', pipelineStageId: otherOpen.id })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_PIPELINE_STAGE_ID');

    const badOwner = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Bad Deal', pipelineStageId: open.id, ownerId: randomUUID() })
      .expect(400);
    expect(badOwner.body.error.code).toBe('INVALID_OWNER_ID');
  });

  it("rejects moving a deal into an isLost stage without a lostReason, server-side (AC-014, M4's key rule)", async () => {
    const { owner } = await setupOrg('deal-lost');
    const { open, lost } = await getStages(owner.accessToken);
    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'At Risk Deal', pipelineStageId: open.id })
      .expect(201);

    const rejected = await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: lost.id })
      .expect(400);
    expect(rejected.body.error.code).toBe('LOST_REASON_REQUIRED');

    const moved = await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: lost.id, lostReason: 'Went with a competitor' })
      .expect(200);
    expect(moved.body.pipelineStageId).toBe(lost.id);
    expect(moved.body.lostReason).toBe('Went with a competitor');
  });

  it('also rejects setting pipelineStageId to a Lost stage via PATCH without a lostReason (not just via move)', async () => {
    const { owner } = await setupOrg('deal-lost-patch');
    const { open, lost } = await getStages(owner.accessToken);
    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Deal', pipelineStageId: open.id })
      .expect(201);

    const res = await request(server)
      .patch(`/api/v1/deals/${deal.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: lost.id })
      .expect(400);
    expect(res.body.error.code).toBe('LOST_REASON_REQUIRED');
  });

  it('moves a deal to Won successfully with no lostReason needed', async () => {
    const { owner } = await setupOrg('deal-won');
    const { open, won } = await getStages(owner.accessToken);
    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Winning Deal', pipelineStageId: open.id })
      .expect(201);

    const moved = await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ pipelineStageId: won.id })
      .expect(200);
    expect(moved.body.pipelineStageId).toBe(won.id);
  });

  it('SALES_REP sees only their own deals and gets 404 (not 403) on others', async () => {
    const { organizationId, owner } = await setupOrg('deal-scope');
    const { open } = await getStages(owner.accessToken);
    const repA = await addMember(organizationId, owner.accessToken, 'deal-scope-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'deal-scope-repb', 'SALES_REP');

    const dealForA = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Deal A', pipelineStageId: open.id, ownerId: repA.memberId })
      .expect(201);
    const dealForB = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'Deal B', pipelineStageId: open.id, ownerId: repB.memberId })
      .expect(201);

    const listAsA = await request(server)
      .get(`/api/v1/deals?ownerId=${repB.memberId}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .expect(200);
    expect(listAsA.body.data).toHaveLength(1);
    expect(listAsA.body.data[0].id).toBe(dealForA.body.id);

    await request(server).get(`/api/v1/deals/${dealForB.body.id}`).set('Authorization', `Bearer ${repA.session.accessToken}`).expect(404);
    await request(server)
      .post(`/api/v1/deals/${dealForB.body.id}/move`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .send({ pipelineStageId: open.id })
      .expect(404);
  });

  it('enforces RBAC: VIEWER cannot create/move deals but can read them', async () => {
    const { organizationId, owner } = await setupOrg('deal-rbac');
    const { open } = await getStages(owner.accessToken);
    const viewer = await addMember(organizationId, owner.accessToken, 'deal-rbac-v', 'VIEWER');

    const deal = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ title: 'RBAC Deal', pipelineStageId: open.id })
      .expect(201);

    await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .send({ title: 'Should be rejected', pipelineStageId: open.id })
      .expect(403);
    await request(server)
      .post(`/api/v1/deals/${deal.body.id}/move`)
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .send({ pipelineStageId: open.id })
      .expect(403);
    await request(server).get(`/api/v1/deals/${deal.body.id}`).set('Authorization', `Bearer ${viewer.session.accessToken}`).expect(200);
  });

  it("can't see another organization's deals at all (AC-007 pattern reused)", async () => {
    const { owner: ownerA } = await setupOrg('deal-crossorg-a');
    const { owner: ownerB } = await setupOrg('deal-crossorg-b');
    const { open: openB } = await getStages(ownerB.accessToken);

    const dealB = await request(server)
      .post('/api/v1/deals')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ title: 'Org B Deal', pipelineStageId: openB.id })
      .expect(201);

    const listAsA = await request(server).get('/api/v1/deals').set('Authorization', `Bearer ${ownerA.accessToken}`).expect(200);
    expect(listAsA.body.data.find((d: { id: string }) => d.id === dealB.body.id)).toBeUndefined();
    await request(server).get(`/api/v1/deals/${dealB.body.id}`).set('Authorization', `Bearer ${ownerA.accessToken}`).expect(404);
  });
});
