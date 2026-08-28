import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-030. AC-021's row is really the Dashboard's, but Activity is exercised
// here end to end since Lead/Deal Detail (docs/ui-ux/README.md §5.3) embed it.
describe('Activities (integration)', () => {
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

  it('creates an activity logged against a lead, and it shows up filtered by leadId (AC-030 pattern)', async () => {
    const { owner } = await setupOrg('activity-crud');
    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead' })
      .expect(201);

    const activity = await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'CALL', notes: 'Intro call', leadId: lead.body.id })
      .expect(201);
    expect(activity.body.leadId).toBe(lead.body.id);
    expect(activity.body.createdById).toBeDefined();

    const list = await request(server)
      .get(`/api/v1/activities?leadId=${lead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].id).toBe(activity.body.id);
  });

  it('rejects an activity with no relation set, and one with more than one relation set', async () => {
    const { owner } = await setupOrg('activity-relation');

    const none = await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'NOTE' })
      .expect(400);
    expect(none.body.error.code).toBe('INVALID_ACTIVITY_RELATION');

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead' })
      .expect(201);
    const contact = await request(server)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane' })
      .expect(201);

    const both = await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'NOTE', leadId: lead.body.id, contactId: contact.body.id })
      .expect(400);
    expect(both.body.error.code).toBe('INVALID_ACTIVITY_RELATION');
  });

  it('rejects a leadId from another organization', async () => {
    const { owner } = await setupOrg('activity-xt-a');
    const { owner: otherOwner } = await setupOrg('activity-xt-b');
    const otherLead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ name: 'Other Org Lead' })
      .expect(201);

    const res = await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ type: 'NOTE', leadId: otherLead.body.id })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_LEAD_ID');
  });

  it('enforces RBAC: VIEWER cannot create activities but can list them', async () => {
    const { organizationId, owner } = await setupOrg('activity-rbac');
    const viewerUser = await registerAndLogin(server, 'activity-rbac-v');
    emailsToClean.push(viewerUser.email);
    const { session: viewerSession } = await inviteAndRefresh(server, owner.accessToken, organizationId, viewerUser, 'VIEWER');

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead' })
      .expect(201);

    await request(server)
      .post('/api/v1/activities')
      .set('Authorization', `Bearer ${viewerSession.accessToken}`)
      .send({ type: 'NOTE', leadId: lead.body.id })
      .expect(403);
    await request(server)
      .get('/api/v1/activities')
      .set('Authorization', `Bearer ${viewerSession.accessToken}`)
      .expect(200);
  });
});
