import { BadRequestException } from '@nestjs/common';
import { ActivityType } from '@prisma/client';
import { ActivityService } from './activity.service';

function buildTxMock() {
  return {
    activity: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    lead: { findUnique: jest.fn() },
    contact: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    deal: { findUnique: jest.fn() },
  };
}

describe('ActivityService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;

  function buildService() {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new ActivityService(tenantContext as any);
  }

  describe('create', () => {
    it('rejects when no relation is set', async () => {
      const service = buildService();
      await expect(service.create({ type: ActivityType.NOTE })).rejects.toThrow(BadRequestException);
      expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('rejects when more than one relation is set', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      tx.contact.findUnique.mockResolvedValue({ id: 'contact-1' });
      await expect(
        service.create({ type: ActivityType.NOTE, leadId: 'lead-1', contactId: 'contact-1' }),
      ).rejects.toThrow(BadRequestException);
      expect(tx.activity.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown leadId', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue(null);
      await expect(service.create({ type: ActivityType.CALL, leadId: 'ghost-lead' })).rejects.toThrow(BadRequestException);
    });

    it('creates an activity scoped to the organization, stamping createdById from tenant context', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      tx.activity.create.mockResolvedValue({ id: 'activity-1' });

      await service.create({ type: ActivityType.CALL, leadId: 'lead-1', notes: 'Talked about pricing' });

      expect(tx.activity.create).toHaveBeenCalledWith({
        data: {
          type: ActivityType.CALL,
          leadId: 'lead-1',
          notes: 'Talked about pricing',
          organizationId: 'org-1',
          createdById: 'member-1',
        },
      });
    });
  });

  describe('findAll', () => {
    it('filters by the provided relation id', async () => {
      const service = buildService();
      tx.activity.findMany.mockResolvedValue([]);
      tx.activity.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20, dealId: 'deal-1' });

      expect(tx.activity.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dealId: 'deal-1' } }),
      );
    });
  });
});
