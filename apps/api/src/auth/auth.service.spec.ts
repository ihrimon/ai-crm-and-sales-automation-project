import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

// Unit tests per M1's Definition of Done ("unit tests on password hashing and
// token issuance"). PrismaService/JwtService/ConfigService are all hand-rolled
// fakes here rather than a real DB/JWT — the integration test
// (auth.integration.spec.ts) is what exercises the real stack end to end.

function buildPrismaMock() {
  return {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    passwordResetToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    emailVerificationToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

function buildJwtMock() {
  return { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
}

function buildConfigMock(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    JWT_ACCESS_TOKEN_TTL: '15m',
    JWT_REFRESH_TOKEN_TTL: '30d',
    ...overrides,
  };
  return { get: jest.fn((key: string) => values[key]) };
}

describe('AuthService', () => {
  let prisma: ReturnType<typeof buildPrismaMock>;
  let jwt: ReturnType<typeof buildJwtMock>;
  let config: ReturnType<typeof buildConfigMock>;
  let service: AuthService;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = buildPrismaMock();
    jwt = buildJwtMock();
    config = buildConfigMock();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prisma as any, jwt as any, config as any);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('hashes the password and never returns it', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: { email: string; passwordHash: string } }) =>
        Promise.resolve({
          id: 'user-1',
          email: data.email,
          passwordHash: data.passwordHash,
          emailVerified: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      );
      prisma.emailVerificationToken.create.mockResolvedValue({});

      const result = await service.register({ email: 'jane@example.com', password: 'super-secret-1' });

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('super-secret-1');
      expect(await bcrypt.compare('super-secret-1', createCall.data.passwordHash)).toBe(true);
      expect(result).toEqual({
        id: 'user-1',
        email: 'jane@example.com',
        emailVerified: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('rejects a duplicate email (AC-001)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing', email: 'jane@example.com' });

      await expect(service.register({ email: 'jane@example.com', password: 'super-secret-1' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues an access token and a hashed, stored refresh token (AC-002)', async () => {
      const passwordHash = await bcrypt.hash('super-secret-1', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'jane@example.com', passwordHash });
      prisma.refreshToken.create.mockResolvedValue({});

      const tokens = await service.login({ email: 'jane@example.com', password: 'super-secret-1' });

      expect(tokens.accessToken).toBe('signed.jwt.token');
      expect(typeof tokens.refreshToken).toBe('string');
      expect(tokens.expiresIn).toBe(15 * 60);

      const createCall = prisma.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.tokenHash).not.toBe(tokens.refreshToken);
      expect(createCall.data.userId).toBe('user-1');
    });

    it('rejects an unknown email without revealing that (AC-002)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'ghost@example.com', password: 'whatever1' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password with the same message as an unknown email (AC-002)', async () => {
      const passwordHash = await bcrypt.hash('correct-password', 10);
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'jane@example.com', passwordHash });

      await expect(service.login({ email: 'jane@example.com', password: 'wrong-password' })).rejects.toThrow(
        'Invalid email or password.',
      );
    });
  });

  describe('logout', () => {
    it('revokes every active refresh token for the user (AC-003)', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.logout('user-1');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('refresh', () => {
    it('rotates: revokes the presented token and issues a new pair', async () => {
      const rawToken = 'raw-refresh-token';
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'jane@example.com' });
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const tokens = await service.refresh(rawToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(tokens.accessToken).toBe('signed.jwt.token');
    });

    it('rejects an already-revoked refresh token (a replayed/reused credential — AC-003)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('raw-refresh-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an unknown refresh token', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('never-issued')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('password reset (FR-004)', () => {
    it('requestPasswordReset silently no-ops for an unknown email (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.requestPasswordReset('ghost@example.com')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('confirmPasswordReset rejects an unknown/expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(service.confirmPasswordReset({ token: 'bogus', newPassword: 'new-secret-1' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('confirmPasswordReset updates the password hash and revokes existing sessions', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await service.confirmPasswordReset({ token: 'raw-reset-token', newPassword: 'brand-new-secret' });

      expect(prisma.$transaction).toHaveBeenCalled();
      const ops = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(ops).toHaveLength(3);
    });
  });

  describe('verifyEmail (FR-005)', () => {
    it('rejects a token that belongs to a different user', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'someone-else',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(service.verifyEmail('user-1', 'raw-token')).rejects.toThrow(BadRequestException);
    });

    it('marks the user verified and the token used', async () => {
      prisma.emailVerificationToken.findUnique.mockResolvedValue({
        id: 'evt-1',
        userId: 'user-1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });

      await service.verifyEmail('user-1', 'raw-token');

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });
});
