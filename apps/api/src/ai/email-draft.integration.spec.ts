import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-039. Runs against the real in-process BullMQ worker and the
// deterministic StubProviderAdapter (see ai-analysis.integration.spec.ts).
describe('Email Drafts (integration)', () => {
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

  async function pollDraft(accessToken: string, emailDraftId: string) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const res = await request(server)
        .get(`/api/v1/email-drafts/${emailDraftId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      if (res.body.status !== 'PENDING') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Email draft did not leave PENDING in time');
  }

  it('generates a draft end to end, then the creator can edit and mark it sent (AC-017)', async () => {
    const { owner } = await setupOrg('draft-crud');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/email-drafts`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ tone: 'friendly' })
      .expect(202);
    expect(accepted.body.emailDraftId).toBeDefined();

    const generated = await pollDraft(owner.accessToken, accepted.body.emailDraftId);
    expect(generated.status).toBe('DRAFT');
    expect(generated.subject).toBeTruthy();
    expect(generated.body).toBeTruthy();

    const edited = await request(server)
      .patch(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ subject: 'Edited subject' })
      .expect(200);
    expect(edited.body.subject).toBe('Edited subject');
    expect(edited.body.status).toBe('DRAFT'); // the system never auto-sends (FR-039)

    const sent = await request(server)
      .patch(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'SENT_MANUALLY' })
      .expect(200);
    expect(sent.body.status).toBe('SENT_MANUALLY');
  });

  it('rejects setting status to PENDING or FAILED via PATCH — those are worker-only states', async () => {
    const { owner } = await setupOrg('draft-status-guard');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);
    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/email-drafts`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({})
      .expect(202);

    await request(server)
      .patch(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'FAILED' })
      .expect(400);
  });

  it('write is limited to creator/OWNER/ADMIN — a non-creator SALES_MANAGER can read but not edit', async () => {
    const { organizationId, owner } = await setupOrg('draft-write-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'draft-scope-repa', 'SALES_REP');
    const manager = await addMember(organizationId, owner.accessToken, 'draft-scope-mgr', 'SALES_MANAGER');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Owned by A', ownerId: repA.memberId })
      .expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/email-drafts`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .send({})
      .expect(202);
    await pollDraft(owner.accessToken, accepted.body.emailDraftId);

    await request(server)
      .get(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${manager.session.accessToken}`)
      .expect(200);

    await request(server)
      .patch(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${manager.session.accessToken}`)
      .send({ status: 'DISCARDED' })
      .expect(403);

    await request(server)
      .patch(`/api/v1/email-drafts/${accepted.body.emailDraftId}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .send({ status: 'DISCARDED' })
      .expect(200);
  });

  it('a SALES_REP gets 404 requesting a draft on a lead they do not own', async () => {
    const { organizationId, owner } = await setupOrg('draft-lead-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'draft-lead-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'draft-lead-repb', 'SALES_REP');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Owned by A', ownerId: repA.memberId })
      .expect(201);

    await request(server)
      .post(`/api/v1/leads/${lead.body.id}/email-drafts`)
      .set('Authorization', `Bearer ${repB.session.accessToken}`)
      .send({})
      .expect(404);
  });
});
