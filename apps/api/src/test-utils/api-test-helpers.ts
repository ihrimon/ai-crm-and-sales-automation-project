import { randomUUID } from 'node:crypto';
import * as request from 'supertest';

const DEFAULT_PASSWORD = 'correct-horse-battery-staple';

export interface TestSession {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

// Registers + logs in a brand-new user. The returned access token predates
// any organization (see AuthService.resolveActiveMembership) — callers that
// need an org-scoped token should go through createOrgAndRefresh() or
// refreshSession() after an invite.
export async function registerAndLogin(
  server: Parameters<typeof request>[0],
  emailPrefix: string,
  password = DEFAULT_PASSWORD,
): Promise<TestSession> {
  // RFC 5321 caps an email's local part at 64 chars — keep emailPrefix short
  // enough (a UUID alone is 36) or class-validator's @IsEmail() rejects it.
  const email = `${emailPrefix}-${randomUUID()}@example.com`;
  await request(server).post('/api/v1/auth/register').send({ email, password }).expect(201);
  const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { email, password, accessToken: loginRes.body.accessToken, refreshToken: loginRes.body.refreshToken };
}

export async function refreshSession(
  server: Parameters<typeof request>[0],
  session: TestSession,
): Promise<TestSession> {
  const res = await request(server).post('/api/v1/auth/refresh').send({ refreshToken: session.refreshToken }).expect(200);
  return { ...session, accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
}

// Creates an organization as `owner` and returns owner's session refreshed to
// an org-scoped token (AuthService re-resolves active membership on every
// refresh — the same mechanism organization.integration.spec.ts relies on).
export async function createOrgAndRefresh(
  server: Parameters<typeof request>[0],
  owner: TestSession,
  name: string,
): Promise<{ organizationId: string; owner: TestSession }> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 8)}`;
  const orgRes = await request(server)
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${owner.accessToken}`)
    .send({ name, slug })
    .expect(201);

  const refreshed = await refreshSession(server, owner);
  return { organizationId: orgRes.body.id, owner: refreshed };
}

// Invites an existing, already-registered user into organizationId with the
// given role, then refreshes their session so it picks up the new org
// context. Returns their org-scoped session plus the created membership id.
export async function inviteAndRefresh(
  server: Parameters<typeof request>[0],
  ownerToken: string,
  organizationId: string,
  invitee: TestSession,
  role: string,
): Promise<{ session: TestSession; memberId: string }> {
  const inviteRes = await request(server)
    .post(`/api/v1/organizations/${organizationId}/members`)
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ email: invitee.email, role })
    .expect(201);

  const session = await refreshSession(server, invitee);
  return { session, memberId: inviteRes.body.id };
}
