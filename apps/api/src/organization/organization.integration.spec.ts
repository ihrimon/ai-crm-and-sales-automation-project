import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../common/prisma/prisma.service';

// M2 Definition of Done: "AC-004/AC-005/AC-006/AC-007 all pass, including an
// automated test that a second organization's data is genuinely unreachable
// — not just unscoped by the query builder, but rejected at the database
// layer too (ADR-004)." This suite runs against the real local Postgres,
// through the real HTTP stack (JwtAuthGuard -> RbacGuard ->
// TenantScopeInterceptor -> RLS), connected as `crm_app` — the same
// non-superuser role production traffic uses (docs/database/README.md §5.6).
describe('Organization + RBAC (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  const password = 'correct-horse-battery-staple';
  const createdEmails: string[] = [];
  const createdOrgIds: string[] = [];

  async function registerAndLogin(emailPrefix: string) {
    const email = `${emailPrefix}-${randomUUID()}@example.com`;
    createdEmails.push(email);
    await request(server).post('/api/v1/auth/register').send({ email, password }).expect(201);
    const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
    return { email, accessToken: loginRes.body.accessToken as string, refreshToken: loginRes.body.refreshToken as string };
  }

  async function createOrgAndRefresh(accessToken: string, refreshToken: string, name: string) {
    const slug = `${name.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const orgRes = await request(server)
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name, slug })
      .expect(201);
    createdOrgIds.push(orgRes.body.id);

    // The token issued at login predates the org — refresh to get one scoped
    // to it (AuthService.resolveActiveMembership re-runs on every refresh).
    const refreshRes = await request(server).post('/api/v1/auth/refresh').send({ refreshToken }).expect(200);
    return { organizationId: orgRes.body.id as string, ...refreshRes.body };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('creates an organization and makes the caller its OWNER (FR-006, AC-004)', async () => {
    const owner = await registerAndLogin('org-owner');
    const { organizationId, accessToken } = await createOrgAndRefresh(owner.accessToken, owner.refreshToken, 'Acme');

    const orgRes = await request(server)
      .get(`/api/v1/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(orgRes.body.id).toBe(organizationId);

    const membersRes = await request(server)
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(membersRes.body.data).toHaveLength(1);
    expect(membersRes.body.data[0].role).toBe('OWNER');
    expect(membersRes.body.meta.total).toBe(1);
  });

  it("rejects reading another organization's data — 404, not 403, matching the NotFound convention (AC-007)", async () => {
    const ownerA = await registerAndLogin('org-a-owner');
    const { organizationId: orgAId, accessToken: tokenA } = await createOrgAndRefresh(
      ownerA.accessToken,
      ownerA.refreshToken,
      'OrgA',
    );

    const ownerB = await registerAndLogin('org-b-owner');
    const { organizationId: orgBId, accessToken: tokenB } = await createOrgAndRefresh(
      ownerB.accessToken,
      ownerB.refreshToken,
      'OrgB',
    );

    // A's token trying to reach B's org (and vice versa) — both directions.
    await request(server).get(`/api/v1/organizations/${orgBId}`).set('Authorization', `Bearer ${tokenA}`).expect(404);
    await request(server)
      .get(`/api/v1/organizations/${orgBId}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
    await request(server).get(`/api/v1/organizations/${orgAId}`).set('Authorization', `Bearer ${tokenB}`).expect(404);

    // Each owner can still read their own.
    await request(server).get(`/api/v1/organizations/${orgAId}`).set('Authorization', `Bearer ${tokenA}`).expect(200);
    await request(server).get(`/api/v1/organizations/${orgBId}`).set('Authorization', `Bearer ${tokenB}`).expect(200);
  });

  it('invites an existing user and enforces RBAC on what the invited role can do (FR-008, AC-005, AC-006)', async () => {
    const owner = await registerAndLogin('inviter');
    const { organizationId, accessToken: ownerToken } = await createOrgAndRefresh(
      owner.accessToken,
      owner.refreshToken,
      'InviteCo',
    );

    const invitee = await registerAndLogin('invitee');
    await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ email: invitee.email, role: 'SALES_REP' })
      .expect(201);

    // Invitee's own token still has no org (issued before the invite) —
    // refresh re-resolves membership, same mechanism as org creation.
    const inviteeRefresh = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: invitee.refreshToken })
      .expect(200);
    const inviteeToken = inviteeRefresh.body.accessToken as string;

    // SALES_REP can read...
    await request(server)
      .get(`/api/v1/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .expect(200);
    // ...but not update org settings (AC-006: backend enforces roles independently of any UI).
    await request(server)
      .patch(`/api/v1/organizations/${organizationId}`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ name: 'Hijacked Name' })
      .expect(403);
    // ...nor invite others.
    await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${inviteeToken}`)
      .send({ email: `nobody-${randomUUID()}@example.com`, role: 'SALES_REP' })
      .expect(403);
  });

  it('rejects inviting an email with no account, and rejects inviting an existing member twice', async () => {
    const owner = await registerAndLogin('inviter2');
    const { organizationId, accessToken } = await createOrgAndRefresh(owner.accessToken, owner.refreshToken, 'DupeCo');

    const res = await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: `ghost-${randomUUID()}@example.com`, role: 'SALES_REP' })
      .expect(400);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');

    const member = await registerAndLogin('dupe-member');
    await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: member.email, role: 'SALES_REP' })
      .expect(201);

    const dupeRes = await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: member.email, role: 'SALES_REP' })
      .expect(400);
    expect(dupeRes.body.error.code).toBe('ALREADY_A_MEMBER');
  });

  it("can't remove or demote the organization's last owner", async () => {
    const owner = await registerAndLogin('sole-owner');
    const { organizationId, accessToken } = await createOrgAndRefresh(owner.accessToken, owner.refreshToken, 'SoleCo');

    const membersRes = await request(server)
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const ownerMemberId = membersRes.body.data[0].id;

    const demoteRes = await request(server)
      .patch(`/api/v1/organizations/${organizationId}/members/${ownerMemberId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ role: 'ADMIN' })
      .expect(400);
    expect(demoteRes.body.error.code).toBe('LAST_OWNER');

    const removeRes = await request(server)
      .delete(`/api/v1/organizations/${organizationId}/members/${ownerMemberId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
    expect(removeRes.body.error.code).toBe('LAST_OWNER');
  });

  it('lets an OWNER remove a non-owner member', async () => {
    const owner = await registerAndLogin('remover');
    const { organizationId, accessToken } = await createOrgAndRefresh(owner.accessToken, owner.refreshToken, 'RemoveCo');

    const member = await registerAndLogin('removee');
    const inviteRes = await request(server)
      .post(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email: member.email, role: 'SALES_REP' })
      .expect(201);

    await request(server)
      .delete(`/api/v1/organizations/${organizationId}/members/${inviteRes.body.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(204);

    const membersRes = await request(server)
      .get(`/api/v1/organizations/${organizationId}/members`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(membersRes.body.data).toHaveLength(1);
  });

  it('rejects an org-scoped request from a user with no organization at all', async () => {
    const noOrgUser = await registerAndLogin('no-org');
    await request(server)
      .get(`/api/v1/organizations/${randomUUID()}`)
      .set('Authorization', `Bearer ${noOrgUser.accessToken}`)
      .expect(403);
  });
});
