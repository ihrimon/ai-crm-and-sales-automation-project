import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { OrgRole } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { parseDurationToSeconds } from '../common/utils/duration';
import type { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export interface PublicUser {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// FR-001–FR-005 (docs/srs/04-functional-requirements.md). Auth is the only
// module with unauthenticated entry points into the system, so the rules
// worth calling out inline: never reveal whether an email is registered
// (login, password-reset/request), never return passwordHash, and never
// email an actual link yet — see logDevLink().
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      // AC-001: "duplicate accounts are rejected safely" — 400 per
      // docs/api/openapi.yaml (register only documents 201/400, no 409).
      throw new BadRequestException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({ data: { email: dto.email, passwordHash } });

    await this.issueEmailVerificationToken(user.id, user.email);

    return this.toPublicUser(user);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const passwordMatches = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;

    if (!user || !passwordMatches) {
      // AC-002: don't reveal whether the email exists — same message either way.
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.issueTokens(user.id, user.email);
  }

  // AC-003: ends the session by revoking every active refresh token for this
  // user. The access token itself stays valid until it naturally expires
  // (short-lived, stateless JWT per ADR — no blocklist) — refresh, not
  // access, is the revocable credential here.
  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    // Rotation: the presented token is single-use — revoke it before issuing
    // a replacement so a captured/replayed refresh token dies after one use.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(user.id, user.email);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      // AC: don't reveal account existence — controller always responds 202.
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    this.logDevLink('Password reset', user.email, rawToken);
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This password reset link is invalid or has expired.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      // A password change invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async verifyEmail(userId: string, token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date() || stored.userId !== userId) {
      throw new BadRequestException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This email verification link is invalid or has expired.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { emailVerified: true } }),
      this.prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    ]);
  }

  private async issueEmailVerificationToken(userId: string, email: string): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    this.logDevLink('Email verification', email, rawToken);
  }

  private async issueTokens(userId: string, email: string): Promise<AuthTokens> {
    const accessTtl = this.configService.get<string>('JWT_ACCESS_TOKEN_TTL') ?? '15m';
    const refreshTtl = this.configService.get<string>('JWT_REFRESH_TOKEN_TTL') ?? '30d';

    const membership = await this.resolveActiveMembership(userId);
    const accessToken = await this.jwtService.signAsync({
      sub: userId,
      email,
      ...(membership && {
        organizationId: membership.organizationId,
        role: membership.role,
        memberId: membership.memberId,
      }),
    });

    const refreshTokenRaw = randomBytes(40).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshTokenRaw),
        expiresAt: new Date(Date.now() + parseDurationToSeconds(refreshTtl) * 1000),
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: parseDurationToSeconds(accessTtl),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  // M2 — resolves which organization a fresh access token should be scoped
  // to (FR-012, architecture/README.md §6.1's Tenant Scope Interceptor).
  // A User can belong to more than one Organization (schema.prisma), but
  // nothing in the current FRs/contract asks for switching the "active" one
  // mid-session — no such endpoint exists. So this picks the earliest-created
  // active membership as a stable default ("their original org"); the common
  // case (one user, one org, from onboarding) has exactly one candidate
  // anyway. A real multi-org active-org switcher is a follow-up, not built
  // here — see docs/development-plan/README.md's M2 notes.
  private async resolveActiveMembership(
    userId: string,
  ): Promise<{ organizationId: string; role: OrgRole; memberId: string } | null> {
    // Not a plain Prisma query: OrganizationMember has RLS, and this lookup
    // is inherently cross-organization (there's no "current org" yet — that's
    // exactly what we're resolving). A real bug caught by
    // organization.integration.spec.ts: the obvious `findFirst` here silently
    // returned nothing, every time, because RLS correctly saw no
    // app.current_organization_id and filtered every row out. Fixed via a
    // narrow SECURITY DEFINER function — see migration
    // 20260827085853_resolve_active_membership_fn (extended in M3, migration
    // 20260827151458_..., to also return the membership's own id — Lead.ownerId
    // and the "SALES_REP sees only own leads" rule both need it) and
    // docs/database/README.md §5.6.
    const rows = await this.prisma.$queryRaw<
      { member_id: string; organization_id: string; role: OrgRole }[]
    >`SELECT * FROM resolve_active_membership(${userId})`;
    const membership = rows[0];
    return membership
      ? { organizationId: membership.organization_id, role: membership.role, memberId: membership.member_id }
      : null;
  }

  private toPublicUser(user: { id: string; email: string; emailVerified: boolean; createdAt: Date }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt.toISOString(),
    };
  }

  // Dev-only stand-in for the Email Provider adapter (architecture/README.md
  // §4) — no email-sending container exists yet in this project's M0–M8
  // milestone list (see SUMMARY.md). Logging the link keeps FR-004/FR-005
  // functionally complete and testable now without guessing ahead of a real
  // provider integration that no current milestone schedules.
  private logDevLink(kind: string, email: string, rawToken: string): void {
    // eslint-disable-next-line no-console
    console.log(`[dev-only] ${kind} token for ${email}: ${rawToken}`);
  }
}
