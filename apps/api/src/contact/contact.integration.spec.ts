import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// FR-019–FR-020. AC-011: create/view/update/delete, no cross-org access.
describe('Contacts (integration)', () => {
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

  it('creates, reads, updates, and deletes a contact (AC-011)', async () => {
    const { owner } = await setupOrg('contact-crud');

    const created = await request(server)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Contact', email: 'jane@example.com' })
      .expect(201);

    await request(server)
      .get(`/api/v1/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);

    const updated = await request(server)
      .patch(`/api/v1/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ position: 'VP Sales' })
      .expect(200);
    expect(updated.body.position).toBe('VP Sales');
    expect(updated.body.name).toBe('Jane Contact'); // partial update: unspecified fields untouched (the LeadUpdate/ContactUpdate contract fix)

    await request(server)
      .delete(`/api/v1/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(server)
      .get(`/api/v1/contacts/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('rejects a companyId from a different organization', async () => {
    const { owner } = await setupOrg('contact-xt-a');
    const { owner: otherOwner } = await setupOrg('contact-xt-b');

    const otherCompany = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${otherOwner.accessToken}`)
      .send({ name: 'Other Co' })
      .expect(201);

    const res = await request(server)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane', companyId: otherCompany.body.id })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_COMPANY_ID');
  });

  it("cannot access another organization's contacts (AC-011)", async () => {
    const { owner: ownerA } = await setupOrg('contact-cross-a');
    const { owner: ownerB } = await setupOrg('contact-cross-b');

    const contactB = await request(server)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Org B Contact' })
      .expect(201);

    await request(server)
      .get(`/api/v1/contacts/${contactB.body.id}`)
      .set('Authorization', `Bearer ${ownerA.accessToken}`)
      .expect(404);
  });
});
