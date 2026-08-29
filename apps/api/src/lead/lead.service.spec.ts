import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { LeadService } from './lead.service';

// Unit tests per M3's Definition of Done. TenantContextService (its `tx`) is
// a hand-rolled fake — lead.integration.spec.ts exercises the real stack
// (real Postgres, real RLS, real round-robin under the FOR UPDATE lock).

function buildTxMock() {
  return {
    lead: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    contact: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn(), findMany: jest.fn() },
    leadRotationState: { upsert: jest.fn(), update: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([{ lastAssignedMemberId: null }]),
  };
}

function buildTenantContextMock(tx: unknown, role: OrgRole = OrgRole.OWNER) {
  return { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role };
}

describe('LeadService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let automationTriggerService: { evaluateAndExecute: jest.Mock };

  function buildService(role: OrgRole = OrgRole.OWNER) {
    tx = buildTxMock();
    automationTriggerService = { evaluateAndExecute: jest.fn().mockResolvedValue(undefined) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new LeadService(buildTenantContextMock(tx, role) as any, automationTriggerService as any);
  }

  describe('create', () => {
    it('rejects an unknown contactId (AC-008: required fields validated)', async () => {
      const service = buildService();
      tx.contact.findUnique.mockResolvedValue(null);

      await expect(service.create({ name: 'Jane', contactId: 'ghost-contact' })).rejects.toThrow(BadRequestException);
      expect(tx.lead.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown companyId', async () => {
      const service = buildService();
      tx.company.findUnique.mockResolvedValue(null);

      await expect(service.create({ name: 'Jane', companyId: 'ghost-company' })).rejects.toThrow(BadRequestException);
    });

    it('rejects an ownerId that is not an active member of the organization', async () => {
      const service = buildService();
      tx.organizationMember.findUnique.mockResolvedValue({ id: 'member-2', isActive: false });

      await expect(service.create({ name: 'Jane', ownerId: 'member-2' })).rejects.toThrow(BadRequestException);
    });

    it('creates the lead scoped to the organization when ownerId is given explicitly (no round-robin)', async () => {
      const service = buildService();
      tx.organizationMember.findUnique.mockResolvedValue({ id: 'member-2', isActive: true });
      tx.lead.create.mockResolvedValue({ id: 'lead-1', ownerId: 'member-2' });

      const result = await service.create({ name: 'Jane', ownerId: 'member-2' });

      expect(tx.lead.create).toHaveBeenCalledWith({
        data: { name: 'Jane', ownerId: 'member-2', organizationId: 'org-1' },
      });
      expect(tx.organizationMember.findMany).not.toHaveBeenCalled(); // no round-robin
      expect(result).toEqual({ id: 'lead-1', ownerId: 'member-2' });
    });

    it('round-robins to the next active SALES_REP when ownerId is omitted (FR-050)', async () => {
      const service = buildService();
      tx.lead.create.mockResolvedValue({ id: 'lead-1', ownerId: null });
      tx.organizationMember.findMany.mockResolvedValue([{ id: 'rep-a' }, { id: 'rep-b' }]);
      tx.$queryRaw.mockResolvedValue([{ lastAssignedMemberId: 'rep-a' }]);
      tx.lead.update.mockResolvedValue({ id: 'lead-1', ownerId: 'rep-b' });

      const result = await service.create({ name: 'Jane' });

      expect(tx.organizationMember.findMany).toHaveBeenCalledWith({
        where: { role: OrgRole.SALES_REP, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { ownerId: 'rep-b' } });
      expect(tx.leadRotationState.update).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { lastAssignedMemberId: 'rep-b' },
      });
      expect(result).toEqual({ id: 'lead-1', ownerId: 'rep-b' });
    });

    it('wraps back to the first rep after the last one (round-robin actually alternates)', async () => {
      const service = buildService();
      tx.lead.create.mockResolvedValue({ id: 'lead-1' });
      tx.organizationMember.findMany.mockResolvedValue([{ id: 'rep-a' }, { id: 'rep-b' }]);
      tx.$queryRaw.mockResolvedValue([{ lastAssignedMemberId: 'rep-b' }]); // rep-b was last
      tx.lead.update.mockResolvedValue({ id: 'lead-1', ownerId: 'rep-a' });

      await service.create({ name: 'Jane' });

      expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { ownerId: 'rep-a' } });
    });

    it('leaves the lead unowned when there are no active SALES_REPs to assign', async () => {
      const service = buildService();
      const created = { id: 'lead-1', ownerId: null };
      tx.lead.create.mockResolvedValue(created);
      tx.organizationMember.findMany.mockResolvedValue([]);

      const result = await service.create({ name: 'Jane' });

      expect(tx.lead.update).not.toHaveBeenCalled();
      expect(result).toBe(created);
    });
  });

  describe('row-level scope (SALES_REP sees only own leads)', () => {
    it('findAll forces ownerId to the caller for a SALES_REP, ignoring any ownerId query param', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.lead.findMany.mockResolvedValue([]);
      tx.lead.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, sort: '-createdAt', ownerId: 'someone-elses-member-id' });

      expect(tx.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ownerId: 'member-1' }) }),
      );
    });

    it('findOne 404s for a SALES_REP on a lead they do not own (not 403 — matches the NotFound convention)', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: 'someone-else' });

      await expect(service.findOne('lead-1')).rejects.toThrow(NotFoundException);
    });

    it('findOne succeeds for a SALES_REP on their own lead', async () => {
      const service = buildService(OrgRole.SALES_REP);
      const lead = { id: 'lead-1', ownerId: 'member-1' };
      tx.lead.findUnique.mockResolvedValue(lead);

      await expect(service.findOne('lead-1')).resolves.toBe(lead);
    });

    it('update 404s for a SALES_REP on a lead they do not own', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: 'someone-else' });

      await expect(service.update('lead-1', { name: 'New name' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove / assign', () => {
    it('remove 404s for a lead that RLS makes invisible (a different org)', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue(null);

      await expect(service.remove('someone-elses-lead')).rejects.toThrow(NotFoundException);
    });

    it('assign rejects an ownerId that is not an active member', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      tx.organizationMember.findUnique.mockResolvedValue(null);

      await expect(service.assign('lead-1', { ownerId: 'ghost-member' })).rejects.toThrow(BadRequestException);
    });

    it('assign updates ownerId when the target member is valid', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      tx.organizationMember.findUnique.mockResolvedValue({ id: 'member-2', isActive: true });
      tx.lead.update.mockResolvedValue({ id: 'lead-1', ownerId: 'member-2' });

      const result = await service.assign('lead-1', { ownerId: 'member-2' });

      expect(tx.lead.update).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { ownerId: 'member-2' } });
      expect(result).toEqual({ id: 'lead-1', ownerId: 'member-2' });
    });
  });
});
