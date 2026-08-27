import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../common/prisma/prisma.service';

// M1 Definition of Done: "integration test hitting POST /auth/register ->
// POST /auth/login -> an authenticated request; AC-001/AC-002/AC-003 pass."
// Runs against the real Postgres in docker-compose.yml (see SUMMARY.md §6 for
// why apps/api/.env, not the root one, is what Prisma actually reads) —
// nothing here is mocked, unlike auth.service.spec.ts.
describe('Auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: Parameters<typeof request>[0];

  const email = `auth-m1-${randomUUID()}@example.com`;
  const password = 'correct-horse-battery-staple';

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
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('registers, logs in, and lets the issued access token make an authenticated request (AC-001, AC-002)', async () => {
    const registerRes = await request(server).post('/api/v1/auth/register').send({ email, password }).expect(201);

    expect(registerRes.body.email).toBe(email);
    expect(registerRes.body.emailVerified).toBe(false);
    expect(registerRes.body.passwordHash).toBeUndefined();

    const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);

    expect(typeof loginRes.body.accessToken).toBe('string');
    expect(typeof loginRes.body.refreshToken).toBe('string');
    expect(loginRes.body.expiresIn).toBeGreaterThan(0);

    // Authenticated request: logout requires a valid Bearer token.
    await request(server)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .expect(204);
  });

  it('rejects a protected route with no token, and with a bogus one (AC-002)', async () => {
    await request(server).post('/api/v1/auth/logout').expect(401);
    await request(server).post('/api/v1/auth/logout').set('Authorization', 'Bearer not-a-real-token').expect(401);
  });

  it('rejects registering the same email twice (AC-001)', async () => {
    const dupeEmail = `auth-m1-dupe-${randomUUID()}@example.com`;
    await request(server).post('/api/v1/auth/register').send({ email: dupeEmail, password }).expect(201);

    const res = await request(server).post('/api/v1/auth/register').send({ email: dupeEmail, password }).expect(400);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(res.body.error.requestId).toEqual(expect.any(String));

    await prisma.user.deleteMany({ where: { email: dupeEmail } });
  });

  it('rejects a wrong password without revealing the account exists (AC-002)', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'totally-wrong-password' })
      .expect(401);
    expect(res.body.error.message).toBe('Invalid email or password.');

    const resUnknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${randomUUID()}@example.com`, password: 'whatever123' })
      .expect(401);
    expect(resUnknown.body.error.message).toBe(res.body.error.message);
  });

  it('logout revokes the refresh token so it cannot be reused (AC-003)', async () => {
    const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
    const { accessToken, refreshToken } = loginRes.body;

    await request(server).post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`).expect(204);

    await request(server).post('/api/v1/auth/refresh').send({ refreshToken }).expect(401);
  });

  it('rotates refresh tokens: the old one stops working once a new pair is issued', async () => {
    const loginRes = await request(server).post('/api/v1/auth/login').send({ email, password }).expect(200);
    const firstRefreshToken = loginRes.body.refreshToken;

    const refreshRes = await request(server)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: firstRefreshToken })
      .expect(200);
    expect(refreshRes.body.refreshToken).not.toBe(firstRefreshToken);

    await request(server).post('/api/v1/auth/refresh').send({ refreshToken: firstRefreshToken }).expect(401);
  });
});
