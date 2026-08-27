import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-021–FR-022. AC-012: create/view/update/delete, no cross-org access.
describe('Companies (integration)', () => {
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

  it('creates, reads, updates, and deletes a company (AC-012)', async () => {
    const { owner } = await setupOrg('company-crud');

    const created = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Inc', website: 'https://acme.example' })
      .expect(201);

    const updated = await request(server)
      .patch(`/api/v1/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ industry: 'Manufacturing' })
      .expect(200);
    expect(updated.body.industry).toBe('Manufacturing');
    expect(updated.body.name).toBe('Acme Inc'); // partial update, not a full replace

    await request(server)
      .delete(`/api/v1/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(server)
      .get(`/api/v1/companies/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('lists and paginates companies', async () => {
    const { owner } = await setupOrg('company-list');
    await request(server).post('/api/v1/companies').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'A' }).expect(201);
    await request(server).post('/api/v1/companies').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'B' }).expect(201);

    const res = await request(server)
      .get('/api/v1/companies?page=1&pageSize=1')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(2);
  });

  it("cannot access another organization's companies (AC-012)", async () => {
    const { owner: ownerA } = await setupOrg('company-cross-a');
    const { owner: ownerB } = await setupOrg('company-cross-b');

    const companyB = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Org B Co' })
      .expect(201);

    await request(server)
      .get(`/api/v1/companies/${companyB.body.id}`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .expect(404);
  });

  it('VIEWER can read but not create/update/delete companies (AC-006)', async () => {
    const { organizationId, owner } = await setupOrg('company-viewer');
    const viewerUser = await registerAndLogin(server, 'company-viewer-v');
    emailsToClean.push(viewerUser.email);
    const { session: viewer } = await inviteAndRefresh(server, owner.accessToken, organizationId, viewerUser, 'VIEWER');

    const company = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Viewer Test Co' })
      .expect(201);

    await request(server)
      .get(`/api/v1/companies/${company.body.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);
    await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ name: 'Should be rejected' })
      .expect(403);
    await request(server)
      .patch(`/api/v1/companies/${company.body.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .send({ name: 'Should be rejected' })
      .expect(403);
    await request(server)
      .delete(`/api/v1/companies/${company.body.id}`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(403);
  });
});
