import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-036–FR-038, FR-040, FR-051 🔎. Runs against the real in-process
// BullMQ worker (AiProcessor) and the deterministic StubProviderAdapter
// (no ANTHROPIC_API_KEY in the test env — see ai-provider.factory.ts), so
// the async 202-then-poll flow completes for real, without a network call.
describe('AI Analyses (integration)', () => {
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

  async function pollAnalysis(accessToken: string, leadId: string, analysisId: string) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const res = await request(server)
        .get(`/api/v1/leads/${leadId}/ai-analyses/${analysisId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      if (res.body.status !== 'PENDING') return res.body;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('AI analysis did not leave PENDING in time');
  }

  it('runs a SCORE analysis end to end: 202 with an id, then polling reaches COMPLETED with all fields (AC-015)', async () => {
    const { owner } = await setupOrg('ai-score');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Prospect', industry: 'Software', jobTitle: 'VP Sales', budget: 50000 })
      .expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'SCORE' })
      .expect(202);
    expect(accepted.body.analysisId).toBeDefined();

    const result = await pollAnalysis(owner.accessToken, lead.body.id, accepted.body.analysisId);
    expect(result.status).toBe('COMPLETED');
    expect(typeof result.score).toBe('number');
    expect(result.classification).toBeTruthy();
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.recommendedAction).toBeTruthy();
    expect(result.rawOutput).toBeUndefined(); // never exposed over the API (ADR-007)
  });

  it('runs a QUALIFICATION analysis end to end (AC-016)', async () => {
    const { owner } = await setupOrg('ai-qualify');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'QUALIFICATION' })
      .expect(202);

    const result = await pollAnalysis(owner.accessToken, lead.body.id, accepted.body.analysisId);
    expect(result.status).toBe('COMPLETED');
    expect(['High', 'Medium', 'Low']).toContain(result.classification);
    expect(result.score).toBeNull();
  });

  it('runs a SUMMARY analysis over logged activity notes end to end (AC-018)', async () => {
    const { owner } = await setupOrg('ai-summary');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);
    await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'CALL', notes: 'Discussed pricing and timeline', leadId: lead.body.id })
      .expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'SUMMARY' })
      .expect(202);

    const result = await pollAnalysis(owner.accessToken, lead.body.id, accepted.body.analysisId);
    expect(result.status).toBe('COMPLETED');
    expect(result.reasons.some((r: string) => r.startsWith('Intent:'))).toBe(true);
    expect(result.reasons.some((r: string) => r.startsWith('Next Follow-up:'))).toBe(true);
  });

  it('a SALES_REP gets 404 requesting or reading analysis on a lead they do not own', async () => {
    const { organizationId, owner } = await setupOrg('ai-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'ai-scope-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'ai-scope-repb', 'SALES_REP');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Owned by A', ownerId: repA.memberId })
      .expect(201);

    await request(server)
      .post(`/api/v1/leads/${lead.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${repB.session.accessToken}`)
      .send({ type: 'SCORE' })
      .expect(404);
  });

  it('enforces RBAC: VIEWER cannot request AI analysis or read one', async () => {
    const { organizationId, owner } = await setupOrg('ai-rbac');
    const viewer = await addMember(organizationId, owner.accessToken, 'ai-rbac-v', 'VIEWER');
    const lead = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Jane Lead' }).expect(201);

    await request(server)
      .post(`/api/v1/leads/${lead.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .send({ type: 'SCORE' })
      .expect(403);
  });

  it('404s reading an analysisId that does not belong to the given leadId', async () => {
    const { owner } = await setupOrg('ai-mismatch');
    const leadA = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Lead A' }).expect(201);
    const leadB = await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Lead B' }).expect(201);

    const accepted = await request(server)
      .post(`/api/v1/leads/${leadA.body.id}/ai-analyses`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'SCORE' })
      .expect(202);

    await request(server)
      .get(`/api/v1/leads/${leadB.body.id}/ai-analyses/${accepted.body.analysisId}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });
});
