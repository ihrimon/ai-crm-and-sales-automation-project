import { NotFoundException } from '@nestjs/common';
import { AutomationActionType, AutomationTriggerType } from '@prisma/client';
import { AutomationService } from './automation.service';

function buildTxMock() {
  return {
    automation: { create: jest.fn(), findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
}

describe('AutomationService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;

  function buildService() {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AutomationService(tenantContext as any);
  }

  it('create() stamps organizationId and createdById', async () => {
    const service = buildService();
    tx.automation.create.mockResolvedValue({ id: 'automation-1' });

    await service.create({ name: 'Notify on Lead Created', triggerType: AutomationTriggerType.LEAD_CREATED, actionType: AutomationActionType.NOTIFY });

    expect(tx.automation.create).toHaveBeenCalledWith({
      data: {
        name: 'Notify on Lead Created',
        triggerType: AutomationTriggerType.LEAD_CREATED,
        actionType: AutomationActionType.NOTIFY,
        organizationId: 'org-1',
        createdById: 'member-1',
      },
    });
  });

  it('findOne() 404s for an automation that does not exist in this organization', async () => {
    const service = buildService();
    tx.automation.findUnique.mockResolvedValue(null);
    await expect(service.findOne('ghost')).rejects.toThrow(NotFoundException);
  });

  it('update() 404s before attempting the update', async () => {
    const service = buildService();
    tx.automation.findUnique.mockResolvedValue(null);
    await expect(service.update('ghost', { isActive: false })).rejects.toThrow(NotFoundException);
    expect(tx.automation.update).not.toHaveBeenCalled();
  });

  it('remove() 404s before attempting the delete', async () => {
    const service = buildService();
    tx.automation.findUnique.mockResolvedValue(null);
    await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    expect(tx.automation.delete).not.toHaveBeenCalled();
  });

  it('findAll() paginates', async () => {
    const service = buildService();
    tx.automation.findMany.mockResolvedValue([{ id: 'a1' }]);
    tx.automation.count.mockResolvedValue(1);

    const result = await service.findAll({ page: 1, pageSize: 20 });

    expect(result).toEqual({ data: [{ id: 'a1' }], meta: { page: 1, pageSize: 20, total: 1 } });
  });
});
