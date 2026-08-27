import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import type { PrismaService } from '../common/prisma/prisma.service';
import { createOrgAndRefresh, inviteAndRefresh, registerAndLogin } from '../test-utils/api-test-helpers';
import { bootstrapTestApp } from '../test-utils/bootstrap-test-app';

// M3 Definition of Done: AC-008/009/010/011/012 pass, plus "a test creating 3
// leads with no owner across 2 active reps confirms the rotation actually
// alternates, not just assigns to the first rep every time." Runs against
// the real local Postgres, through the real HTTP stack, connected as
// `crm_app` — same as auth/organization integration tests.
describe('Leads (integration)', () => {
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
    const owner = await registerAndLogin(server, `${name}-owner`);
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

  it('creates a lead with no active reps to assign to — stays unowned (AC-008)', async () => {
    const { organizationId, owner } = await setupOrg('lead-basic');

    const res = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Cooper', email: 'jane@example.com' })
      .expect(201);

    expect(res.body.name).toBe('Jane Cooper');
    expect(res.body.ownerId).toBeNull();
    expect(res.body.organizationId).toBe(organizationId);
  });

  it('rejects a lead with a contactId/companyId/ownerId from outside the organization', async () => {
    const { owner } = await setupOrg('lead-xt-a');
    const { owner: otherOrgOwner } = await setupOrg('lead-xt-b');

    const otherCompany = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${otherOrgOwner.accessToken}`)
      .send({ name: 'Other Org Co' })
      .expect(201);

    const res = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane', companyId: otherCompany.body.id })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_COMPANY_ID');

    const badOwnerRes = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane', ownerId: randomUUID() })
      .expect(400);
    expect(badOwnerRes.body.error.code).toBe('INVALID_OWNER_ID');
  });

  it('links a lead to a contact and company in the same organization, then updates and deletes it (AC-008, AC-011, AC-012)', async () => {
    const { owner } = await setupOrg('lead-links');

    const company = await request(server)
      .post('/api/v1/companies')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Acme Inc' })
      .expect(201);
    const contact = await request(server)
      .post('/api/v1/contacts')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Contact', companyId: company.body.id })
      .expect(201);

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Jane Lead', companyId: company.body.id, contactId: contact.body.id })
      .expect(201);
    expect(lead.body.companyId).toBe(company.body.id);
    expect(lead.body.contactId).toBe(contact.body.id);

    const updated = await request(server)
      .patch(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ status: 'QUALIFIED' })
      .expect(200);
    expect(updated.body.status).toBe('QUALIFIED');

    await request(server)
      .delete(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(204);
    await request(server)
      .get(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(404);
  });

  it('searches, filters, and paginates leads (AC-009)', async () => {
    const { owner } = await setupOrg('lead-search');
    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Findable Jane' }).expect(201);
    await request(server).post('/api/v1/leads').set('Authorization', `Bearer ${owner.accessToken}`).send({ name: 'Someone Else', status: undefined }).expect(201);

    const searchRes = await request(server)
      .get('/api/v1/leads?search=Findable')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].name).toBe('Findable Jane');

    const pageRes = await request(server)
      .get('/api/v1/leads?page=1&pageSize=1')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .expect(200);
    expect(pageRes.body.data).toHaveLength(1);
    expect(pageRes.body.meta.total).toBe(2);
  });

  it('round-robins 3 leads across 2 active SALES_REPs, alternating rather than always picking the first (FR-050, AC-010)', async () => {
    const { organizationId, owner } = await setupOrg('lead-rr');
    const repA = await addMember(organizationId, owner.accessToken, 'lead-rr-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'lead-rr-repb', 'SALES_REP');

    const owners: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await request(server)
        .post('/api/v1/leads')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ name: `Round Robin Lead ${i}` })
        .expect(201);
      owners.push(res.body.ownerId);
    }

    expect(owners.every((id) => id !== null)).toBe(true);
    expect(new Set(owners.slice(0, 2))).toEqual(new Set([repA.memberId, repB.memberId]));
    expect(owners[2]).toBe(owners[0]); // wraps back around after 2 reps
    expect(owners[0]).not.toBe(owners[1]); // actually alternates, not always the same rep
  });

  it('SALES_REP sees only their own leads, and gets 404 (not 403) on others (AC-007 pattern reused for row-level scope)', async () => {
    const { organizationId, owner } = await setupOrg('lead-scope');
    const repA = await addMember(organizationId, owner.accessToken, 'lead-scope-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'lead-scope-repb', 'SALES_REP');

    const leadForA = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Lead For A', ownerId: repA.memberId })
      .expect(201);
    const leadForB = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Lead For B', ownerId: repB.memberId })
      .expect(201);

    const listAsA = await request(server)
      .get(`/api/v1/leads?ownerId=${repB.memberId}`) // A tries to widen the filter to B's leads
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .expect(200);
    expect(listAsA.body.data).toHaveLength(1);
    expect(listAsA.body.data[0].id).toBe(leadForA.body.id);

    await request(server)
      .get(`/api/v1/leads/${leadForB.body.id}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .expect(404);
    await request(server)
      .patch(`/api/v1/leads/${leadForB.body.id}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .send({ name: 'Hijacked' })
      .expect(404);
    await request(server)
      .get(`/api/v1/leads/${leadForA.body.id}`)
      .set('Authorization', `Bearer ${repA.session.accessToken}`)
      .expect(200);
  });

  it('enforces RBAC: SALES_REP cannot delete, VIEWER cannot create (AC-006 pattern reused)', async () => {
    const { organizationId, owner } = await setupOrg('lead-rbac');
    const rep = await addMember(organizationId, owner.accessToken, 'lead-rbac-rep', 'SALES_REP');
    const viewer = await addMember(organizationId, owner.accessToken, 'lead-rbac-viewer', 'VIEWER');

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'RBAC Lead', ownerId: rep.memberId })
      .expect(201);

    await request(server)
      .delete(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${rep.session.accessToken}`)
      .expect(403);

    await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .send({ name: 'Viewer should not create this' })
      .expect(403);

    // VIEWER can still read.
    await request(server)
      .get(`/api/v1/leads/${lead.body.id}`)
      .set('Authorization', `Bearer ${viewer.session.accessToken}`)
      .expect(200);
  });

  it('assignLead lets a manager reassign any lead in the org', async () => {
    const { organizationId, owner } = await setupOrg('lead-assign');
    const repA = await addMember(organizationId, owner.accessToken, 'lead-assign-repa', 'SALES_REP');
    const repB = await addMember(organizationId, owner.accessToken, 'lead-assign-repb', 'SALES_REP');

    const lead = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ name: 'Assignable Lead', ownerId: repA.memberId })
      .expect(201);

    const reassigned = await request(server)
      .post(`/api/v1/leads/${lead.body.id}/assign`)
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ ownerId: repB.memberId })
      .expect(200);
    expect(reassigned.body.ownerId).toBe(repB.memberId);
  });

  it("can't see another organization's leads at all (AC-007)", async () => {
    const { owner: ownerA } = await setupOrg('lead-crossorg-a');
    const { owner: ownerB } = await setupOrg('lead-crossorg-b');

    const leadB = await request(server)
      .post('/api/v1/leads')
      .set('Authorization', `Bearer ${ownerB.accessToken}`)
      .send({ name: 'Org B Lead' })
      .expect(201);

    const listAsA = await request(server).get('/api/v1/leads').set('Authorization', `Bearer ${ownerA.accessToken}`).expect(200);
    expect(listAsA.body.data.find((l: { id: string }) => l.id === leadB.body.id)).toBeUndefined();

    await request(server).get(`/api/v1/leads/${leadB.body.id}`).set('Authorization', `Bearer ${ownerA.accessToken}`).expect(404);
  });
});
