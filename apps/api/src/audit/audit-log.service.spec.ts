import { AuditAction } from '@prisma/client';
import { AuditLogService } from './audit-log.service';

function buildTxMock() {
  return {
    auditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
  };
}

describe('AuditLogService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let service: AuditLogService;

  beforeEach(() => {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuditLogService(tenantContext as any);
  });

  describe('record', () => {
    it('writes an AuditLog row scoped to the current tenant and actor', async () => {
      await service.record({ entityType: 'Lead', entityId: 'lead-1', action: AuditAction.CREATE, newValue: { id: 'lead-1', name: 'Jane' } });

      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          actorUserId: 'user-1',
          entityType: 'Lead',
          entityId: 'lead-1',
          action: AuditAction.CREATE,
          oldValue: expect.anything(),
          newValue: { id: 'lead-1', name: 'Jane' },
        },
      });
    });

    it('never captures passwordHash even if a caller accidentally passes a User-shaped value (FR-048 DoD)', async () => {
      await service.record({
        entityType: 'OrganizationMember',
        entityId: 'member-2',
        action: AuditAction.UPDATE,
        oldValue: { id: 'member-2', user: { passwordHash: 'top-secret' } },
        newValue: { id: 'member-2', user: { passwordHash: 'new-secret' } },
      });

      const call = tx.auditLog.create.mock.calls[0][0];
      expect(JSON.stringify(call.data.oldValue)).not.toContain('top-secret');
      expect(JSON.stringify(call.data.newValue)).not.toContain('new-secret');
    });

    it('never throws back to the caller when the underlying write fails (defensive side effect)', async () => {
      tx.auditLog.create.mockRejectedValue(new Error('db exploded'));

      await expect(
        service.record({ entityType: 'Lead', entityId: 'lead-1', action: AuditAction.DELETE, oldValue: { id: 'lead-1' } }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('filters by entityType and entityId when provided', async () => {
      await service.findAll({ page: 1, pageSize: 20, entityType: 'Lead', entityId: 'lead-1' });

      expect(tx.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entityType: 'Lead', entityId: 'lead-1' } }),
      );
    });

    it('has no filters when entityType/entityId are omitted', async () => {
      await service.findAll({ page: 1, pageSize: 20 });

      expect(tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });
});
