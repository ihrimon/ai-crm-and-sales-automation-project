import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { DealService } from './deal.service';

function buildTxMock() {
  return {
    deal: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    pipelineStage: { findUnique: jest.fn() },
    lead: { findUnique: jest.fn() },
    contact: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
  };
}

describe('DealService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let automationTriggerService: { evaluateAndExecute: jest.Mock };

  function buildService(role: OrgRole = OrgRole.OWNER) {
    tx = buildTxMock();
    automationTriggerService = { evaluateAndExecute: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new DealService(tenantContext as any, automationTriggerService as any);
  }

  describe('create', () => {
    it('rejects an unknown pipelineStageId', async () => {
      const service = buildService();
      tx.pipelineStage.findUnique.mockResolvedValue(null);

      await expect(service.create({ title: 'Deal', pipelineStageId: 'ghost-stage' })).rejects.toThrow(BadRequestException);
      expect(tx.deal.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown leadId/contactId/companyId/ownerId', async () => {
      const service = buildService();
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-1', isLost: false });
      tx.lead.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ title: 'Deal', pipelineStageId: 'stage-1', leadId: 'ghost-lead' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a deal scoped to the organization', async () => {
      const service = buildService();
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-1', isLost: false });
      tx.deal.create.mockResolvedValue({ id: 'deal-1' });

      await service.create({ title: 'Deal', pipelineStageId: 'stage-1' });

      expect(tx.deal.create).toHaveBeenCalledWith({
        data: { title: 'Deal', pipelineStageId: 'stage-1', organizationId: 'org-1' },
      });
    });
  });

  describe('row-level scope (SALES_REP sees only own deals)', () => {
    it('findAll forces ownerId to the caller for a SALES_REP, ignoring any ownerId query param', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.deal.findMany.mockResolvedValue([]);
      tx.deal.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, ownerId: 'someone-elses-member-id' });

      expect(tx.deal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ ownerId: 'member-1' }) }),
      );
    });

    it('findOne 404s for a SALES_REP on a deal they do not own', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: 'someone-else' });

      await expect(service.findOne('deal-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('move (FR-025, FR-028) — lostReason required for a Lost stage', () => {
    it('rejects moving into an isLost stage with no lostReason', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: null });
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-lost', isLost: true });

      const res = service.move('deal-1', { pipelineStageId: 'stage-lost' });
      await expect(res).rejects.toThrow(BadRequestException);
      await expect(res).rejects.toMatchObject({ response: { code: 'LOST_REASON_REQUIRED' } });
      expect(tx.deal.update).not.toHaveBeenCalled();
    });

    it('allows moving into an isLost stage when lostReason is given', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: null });
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-lost', isLost: true });
      tx.deal.update.mockResolvedValue({ id: 'deal-1', pipelineStageId: 'stage-lost', lostReason: 'Budget cut' });

      await service.move('deal-1', { pipelineStageId: 'stage-lost', lostReason: 'Budget cut' });

      expect(tx.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
        data: { pipelineStageId: 'stage-lost', lostReason: 'Budget cut' },
      });
    });

    it('allows moving into a non-Lost stage with no lostReason', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: null });
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-won', isLost: false, isWon: true });
      tx.deal.update.mockResolvedValue({ id: 'deal-1' });

      await expect(service.move('deal-1', { pipelineStageId: 'stage-won' })).resolves.toBeDefined();
    });

    it('rejects the same way via update() when pipelineStageId is changed there instead of move()', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: null });
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-lost', isLost: true });

      await expect(service.update('deal-1', { pipelineStageId: 'stage-lost' })).rejects.toThrow(BadRequestException);
      expect(tx.deal.update).not.toHaveBeenCalled();
    });
  });

  describe('cross-tenant validation', () => {
    it('rejects an ownerId that is not an active member of the organization', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1', ownerId: null });
      tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-1', isLost: false });
      tx.organizationMember.findUnique.mockResolvedValue({ id: 'member-2', isActive: false });

      await expect(service.update('deal-1', { ownerId: 'member-2' })).rejects.toThrow(BadRequestException);
    });
  });
});
