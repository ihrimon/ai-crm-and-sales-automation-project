import { NotFoundException } from '@nestjs/common';
import { NotificationService } from './notification.service';

function buildTxMock() {
  return {
    notification: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('NotificationService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let service: NotificationService;

  beforeEach(() => {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new NotificationService(tenantContext as any);
  });

  describe('create', () => {
    it('creates a Notification scoped to the current organization', async () => {
      tx.notification.create.mockResolvedValue({ id: 'notif-1' });

      await service.create({ recipientMemberId: 'member-2', type: 'AUTOMATION', payload: { foo: 'bar' } });

      expect(tx.notification.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', recipientMemberId: 'member-2', type: 'AUTOMATION', payload: { foo: 'bar' } },
      });
    });
  });

  describe('findAll', () => {
    it('is always scoped to the caller\'s own memberId, regardless of role', async () => {
      await service.findAll({ page: 1, pageSize: 20 });

      expect(tx.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientMemberId: 'member-1' } }),
      );
    });

    it('filters by isRead when provided', async () => {
      await service.findAll({ page: 1, pageSize: 20, isRead: false });

      expect(tx.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { recipientMemberId: 'member-1', isRead: false } }),
      );
    });
  });

  describe('markRead', () => {
    it('marks the caller\'s own notification as read', async () => {
      tx.notification.findUnique.mockResolvedValue({ id: 'notif-1', recipientMemberId: 'member-1' });
      tx.notification.update.mockResolvedValue({ id: 'notif-1', isRead: true });

      await service.markRead('notif-1');

      expect(tx.notification.update).toHaveBeenCalledWith({ where: { id: 'notif-1' }, data: { isRead: true } });
    });

    it('404s (not 403) for a notification addressed to someone else', async () => {
      tx.notification.findUnique.mockResolvedValue({ id: 'notif-1', recipientMemberId: 'someone-else' });

      await expect(service.markRead('notif-1')).rejects.toThrow(NotFoundException);
      expect(tx.notification.update).not.toHaveBeenCalled();
    });

    it('404s for a notification that does not exist', async () => {
      tx.notification.findUnique.mockResolvedValue(null);

      await expect(service.markRead('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
