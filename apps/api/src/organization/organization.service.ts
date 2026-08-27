import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { InviteMemberDto } from './dto/invite-member.dto';
import type { ListMembersQueryDto } from './dto/list-members-query.dto';
import type { UpdateMemberDto } from './dto/update-member.dto';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

// FR-006–FR-012 (docs/srs/04-functional-requirements.md). Every method here
// except `create` runs inside a request already wrapped by
// TenantScopeInterceptor — it reads/writes exclusively through
// `tenantContext.tx`, the same transaction app.current_organization_id was
// set_config()'d on, so RLS (docs/database/README.md §5.6) actually applies.
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // No tenant context exists yet — the caller doesn't have an organization
  // until this call succeeds (@SkipTenantScope() on the route). Uses the
  // plain PrismaService, not tenantContext.tx.
  async create(userId: string, dto: CreateOrganizationDto) {
    const existingSlug = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existingSlug) {
      throw new BadRequestException({ code: 'SLUG_ALREADY_TAKEN', message: 'This organization slug is already taken.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: dto.name, slug: dto.slug } });
      // OrganizationMember's RLS policy (docs/database/rls-policies.sql)
      // applies its USING expression as the INSERT's WITH CHECK too, by
      // Postgres default — so without this, the very first membership row
      // for a brand-new org fails closed with "new row violates row-level
      // security policy" (caught by the integration test, not assumed away):
      // there's no "current organization" to have been set before the
      // organization itself existed. Set it now, inside this same
      // transaction, for the one INSERT that legitimately needs it before
      // TenantScopeInterceptor would ever run for this org.
      await tx.$executeRaw`SELECT set_config('app.current_organization_id', ${organization.id}, true)`;
      await tx.organizationMember.create({
        data: { organizationId: organization.id, userId, role: OrgRole.OWNER, isActive: true },
      });
      return organization;
    });
  }

  async getById() {
    const organization = await this.tenantContext.tx.organization.findUnique({
      where: { id: this.tenantContext.organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }
    return organization;
  }

  async update(dto: UpdateOrganizationDto) {
    return this.tenantContext.tx.organization.update({
      where: { id: this.tenantContext.organizationId },
      data: dto,
    });
  }

  async listMembers(query: ListMembersQueryDto) {
    const { page, pageSize } = query;
    const [data, total] = await Promise.all([
      this.tenantContext.tx.organizationMember.findMany({
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.organizationMember.count(),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async inviteMember(dto: InviteMemberDto) {
    const user = await this.tenantContext.tx.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      // FR-008 — no email-sending provider exists yet (same limitation as
      // M1's password-reset/email-verify, docs/development-plan/README.md
      // §4.1a): an invite can only attach an *existing* account today.
      throw new BadRequestException({
        code: 'USER_NOT_FOUND',
        message: 'No account exists for this email yet — they need to register first.',
      });
    }

    const existingMembership = await this.tenantContext.tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: this.tenantContext.organizationId, userId: user.id } },
    });
    if (existingMembership) {
      throw new BadRequestException({
        code: 'ALREADY_A_MEMBER',
        message: 'This user is already a member of the organization.',
      });
    }

    return this.tenantContext.tx.organizationMember.create({
      data: { organizationId: this.tenantContext.organizationId, userId: user.id, role: dto.role, isActive: true },
    });
  }

  async updateMember(memberId: string, dto: UpdateMemberDto) {
    const member = await this.findMemberOrThrow(memberId);

    const willLoseOwnerAccess =
      member.role === OrgRole.OWNER &&
      member.isActive &&
      ((dto.role !== undefined && dto.role !== OrgRole.OWNER) || dto.isActive === false);
    if (willLoseOwnerAccess) {
      await this.assertNotLastActiveOwner(member.id);
    }

    return this.tenantContext.tx.organizationMember.update({
      where: { id: memberId },
      data: dto,
    });
  }

  async removeMember(memberId: string): Promise<void> {
    const member = await this.findMemberOrThrow(memberId);
    if (member.role === OrgRole.OWNER && member.isActive) {
      await this.assertNotLastActiveOwner(member.id);
    }
    await this.tenantContext.tx.organizationMember.delete({ where: { id: memberId } });
  }

  private async findMemberOrThrow(memberId: string) {
    // RLS already scopes this to the current organization — a memberId from
    // a different org simply won't be found, not silently returned (AC-007).
    const member = await this.tenantContext.tx.organizationMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Member not found.');
    }
    return member;
  }

  // An organization can never be left without at least one active OWNER —
  // not an FR, but the obvious failure mode of allowing the last owner to
  // demote/remove themselves (or be demoted/removed) with no one left able
  // to manage the org.
  private async assertNotLastActiveOwner(excludingMemberId: string): Promise<void> {
    const otherActiveOwners = await this.tenantContext.tx.organizationMember.count({
      where: { role: OrgRole.OWNER, isActive: true, id: { not: excludingMemberId } },
    });
    if (otherActiveOwners === 0) {
      throw new BadRequestException({
        code: 'LAST_OWNER',
        message: "Can't remove or demote the organization's last owner.",
      });
    }
  }
}
