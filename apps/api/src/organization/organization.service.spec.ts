import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { OrganizationService } from './organization.service';

// Unit tests per M2's Definition of Done. PrismaService/TenantContextService
// are hand-rolled fakes — organization.integration.spec.ts exercises the real
// stack (real Postgres, real RLS, real cross-org rejection) end to end.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildPrismaMock(): any {
  const client: Record<string, unknown> = {
    organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    organizationMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: { findUnique: jest.fn() },
  };
  // `create()` set_config()'s the new org id via $executeRaw before the
  // membership insert (docs/database/README.md §5.6) — not meaningful
  // against this mock (no real RLS to satisfy), just needs to exist.
  client.$executeRaw = jest.fn();
  // `create()`'s org+membership transaction just runs the callback against
  // this same mock — good enough for a unit test that isn't verifying
  // real transactional atomicity (the integration test covers that for real).
  client.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(client));
  return client;
}

function buildTenantContextMock(tx: unknown, organizationId = 'org-1') {
  return { tx, organizationId, userId: 'user-1', role: OrgRole.OWNER };
}

describe('OrganizationService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;
  let tenantContext: ReturnType<typeof buildTenantContextMock>;
  let service: OrganizationService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    tenantContext = buildTenantContextMock(prisma);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OrganizationService(prisma, tenantContext as any);
  });

  describe('create', () => {
    it('rejects a slug that is already taken', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing', slug: 'acme' });

      await expect(service.create('user-1', { name: 'Acme', slug: 'acme' })).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates the organization and makes the caller its OWNER (FR-006, AC-004)', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.organization.create.mockResolvedValue({ id: 'org-new', name: 'Acme', slug: 'acme' });
      prisma.organizationMember.create.mockResolvedValue({});

      await service.create('user-1', { name: 'Acme', slug: 'acme' });

      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-new', userId: 'user-1', role: OrgRole.OWNER, isActive: true },
      });
    });
  });

  describe('inviteMember (FR-008)', () => {
    it('rejects inviting an email with no existing account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.inviteMember({ email: 'ghost@example.com', role: OrgRole.SALES_REP })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects inviting someone already a member', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'jane@example.com' });
      prisma.organizationMember.findUnique.mockResolvedValue({ id: 'existing-membership' });

      await expect(service.inviteMember({ email: 'jane@example.com', role: OrgRole.SALES_REP })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('creates a new active membership for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'user-2', email: 'jane@example.com' });
      prisma.organizationMember.findUnique.mockResolvedValue(null);
      prisma.organizationMember.create.mockResolvedValue({});

      await service.inviteMember({ email: 'jane@example.com', role: OrgRole.SALES_REP });

      expect(prisma.organizationMember.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', userId: 'user-2', role: OrgRole.SALES_REP, isActive: true },
      });
    });
  });

  describe('updateMember / removeMember — last-owner guard', () => {
    it('rejects removing the sole active owner', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member-1',
        role: OrgRole.OWNER,
        isActive: true,
      });
      prisma.organizationMember.count.mockResolvedValue(0); // no other active owners

      await expect(service.removeMember('member-1')).rejects.toThrow(BadRequestException);
      expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
    });

    it('allows removing an owner when another active owner exists', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member-1',
        role: OrgRole.OWNER,
        isActive: true,
      });
      prisma.organizationMember.count.mockResolvedValue(1); // one other active owner
      prisma.organizationMember.delete.mockResolvedValue({});

      await service.removeMember('member-1');

      expect(prisma.organizationMember.delete).toHaveBeenCalledWith({ where: { id: 'member-1' } });
    });

    it('rejects demoting the sole active owner to a non-owner role', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member-1',
        role: OrgRole.OWNER,
        isActive: true,
      });
      prisma.organizationMember.count.mockResolvedValue(0);

      await expect(service.updateMember('member-1', { role: OrgRole.ADMIN })).rejects.toThrow(BadRequestException);
    });

    it('rejects deactivating the sole active owner', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member-1',
        role: OrgRole.OWNER,
        isActive: true,
      });
      prisma.organizationMember.count.mockResolvedValue(0);

      await expect(service.updateMember('member-1', { isActive: false })).rejects.toThrow(BadRequestException);
    });

    it('allows updating a non-owner member freely', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue({
        id: 'member-2',
        role: OrgRole.SALES_REP,
        isActive: true,
      });
      prisma.organizationMember.update.mockResolvedValue({});

      await service.updateMember('member-2', { role: OrgRole.SALES_MANAGER });

      expect(prisma.organizationMember.count).not.toHaveBeenCalled();
      expect(prisma.organizationMember.update).toHaveBeenCalledWith({
        where: { id: 'member-2' },
        data: { role: OrgRole.SALES_MANAGER },
      });
    });

    it('throws NotFound for a member id that RLS makes invisible (a different org)', async () => {
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      await expect(service.removeMember('someone-elses-member-id')).rejects.toThrow(NotFoundException);
    });
  });
});
