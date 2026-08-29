import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-046–FR-047. Notifications are created as a side effect of the
// Automation engine's NOTIFY action (M7/M8) — there's no POST /notifications,
// so every case here drives a NOTIFY automation to produce one.
describe('Notifications (integration)', () => {
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

  it("a NOTIFY automation creates a notification for the lead's owner, visible via GET /notifications", async () => {
    const { organizationId, owner } = await setupOrg('notif-crud');
    const rep = await addMember(organizationId, owner.accessToken, 'notif-crud-rep', 'SALES_REP');

    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Notify Owner', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' })
      .expect(201);

    await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Prospect', ownerId: rep.memberId })
      .expect(201);

    const list = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${rep.session.accessToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ type: 'AUTOMATION', isRead: false });
  });

  it('marking a notification read is idempotent and reflected in GET /notifications?isRead=false', async () => {
    const { organizationId, owner } = await setupOrg('notif-read');
    const rep = await addMember(organizationId, owner.accessToken, 'notif-read-rep', 'SALES_REP');

    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Notify Owner', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' })
      .expect(201);
    await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Prospect', ownerId: rep.memberId })
      .expect(201);

    const list = await request(server).get('/api/v1/notifications').set('Authorization', `Bearer ${rep.session.accessToken}`).expect(200);
    const notificationId = list.body.data[0].id;

    const marked = await request(server)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${rep.session.accessToken}`)
      .expect(200);
    expect(marked.body.isRead).toBe(true);

    const unread = await request(server)
      .get('/api/v1/notifications?isRead=false')
      .set('Authorization', `Bearer ${rep.session.accessToken}`)
      .expect(200);
    expect(unread.body.data).toHaveLength(0);
  });

  it("is always scoped to the caller's own notifications — another member (even the OWNER) gets 404 marking someone else's read, and never sees it listed", async () => {
    const { organizationId, owner } = await setupOrg('notif-scope');
    const rep = await addMember(organizationId, owner.accessToken, 'notif-scope-rep', 'SALES_REP');

    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Notify Owner', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' })
      .expect(201);
    await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Prospect', ownerId: rep.memberId })
      .expect(201);

    const repList = await request(server).get('/api/v1/notifications').set('Authorization', `Bearer ${rep.session.accessToken}`).expect(200);
    const notificationId = repList.body.data[0].id;

    const ownerList = await request(server).get('/api/v1/notifications').set('Authorization', `Bearer ${owner.accessToken}`).expect(200);
    expect(ownerList.body.data).toHaveLength(0);

    const res = await request(server)
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
    expect(res.body.error).toBeDefined();
  });

  it('a VIEWER can list and mark their own notifications read (no @Roles restriction on this resource)', async () => {
    const { organizationId, owner } = await setupOrg('notif-viewer');
    const viewer = await addMember(organizationId, owner.accessToken, 'notif-viewer-v', 'VIEWER');

    await request(server)
      .post('/api/v1/automations')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Notify Owner', triggerType: 'LEAD_CREATED', actionType: 'NOTIFY' })
      .expect(201);
    await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Prospect', ownerId: viewer.memberId })
      .expect(201);

    const list = await request(server).get('/api/v1/notifications').set('Authorization', `Bearer ${viewer.session.accessToken}`).expect(200);
    expect(list.body.data).toHaveLength(1);

    await request(server)
      .patch(`/api/v1/notifications/${list.body.data[0].id}/read`)
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .expect(200);
  });
});
