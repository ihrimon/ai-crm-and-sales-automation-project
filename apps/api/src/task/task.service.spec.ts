import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrgRole, TaskStatus } from '@prisma/client';
import { TaskService } from './task.service';

function buildTxMock() {
  return {
    task: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    lead: { findUnique: jest.fn() },
    contact: { findUnique: jest.fn() },
    company: { findUnique: jest.fn() },
    deal: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
  };
}

describe('TaskService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;

  function buildService(role: OrgRole = OrgRole.OWNER) {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new TaskService(tenantContext as any);
  }

  describe('create', () => {
    it('rejects when no relation is set', async () => {
      const service = buildService();
      await expect(service.create({ title: 'Follow up' })).rejects.toThrow(BadRequestException);
      expect(tx.task.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown assignedToId', async () => {
      const service = buildService();
      tx.deal.findUnique.mockResolvedValue({ id: 'deal-1' });
      tx.organizationMember.findUnique.mockResolvedValue(null);
      await expect(
        service.create({ title: 'Follow up', dealId: 'deal-1', assignedToId: 'ghost-member' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a task scoped to the organization', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
      tx.task.create.mockResolvedValue({ id: 'task-1' });

      await service.create({ title: 'Send proposal', leadId: 'lead-1' });

      expect(tx.task.create).toHaveBeenCalledWith({
        data: { title: 'Send proposal', leadId: 'lead-1', organizationId: 'org-1' },
      });
    });
  });

  describe('update — write limited to the assignee or a manager-tier role', () => {
    it('allows the assignee (a SALES_REP) to update their own task', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.task.findUnique.mockResolvedValue({ id: 'task-1', assignedToId: 'member-1' });
      tx.task.update.mockResolvedValue({ id: 'task-1', status: TaskStatus.DONE });

      await expect(service.update('task-1', { status: TaskStatus.DONE })).resolves.toBeDefined();
      expect(tx.task.update).toHaveBeenCalledWith({ where: { id: 'task-1' }, data: { status: TaskStatus.DONE } });
    });

    it('rejects a SALES_REP who is not the assignee', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.task.findUnique.mockResolvedValue({ id: 'task-1', assignedToId: 'someone-else' });

      await expect(service.update('task-1', { status: TaskStatus.DONE })).rejects.toThrow(ForbiddenException);
      expect(tx.task.update).not.toHaveBeenCalled();
    });

    it('allows a SALES_MANAGER regardless of assignment', async () => {
      const service = buildService(OrgRole.SALES_MANAGER);
      tx.task.findUnique.mockResolvedValue({ id: 'task-1', assignedToId: 'someone-else' });
      tx.task.update.mockResolvedValue({ id: 'task-1' });

      await expect(service.update('task-1', { status: TaskStatus.DONE })).resolves.toBeDefined();
    });

    it('404s for a task that does not exist in this organization', async () => {
      const service = buildService();
      tx.task.findUnique.mockResolvedValue(null);
      await expect(service.update('ghost-task', { status: TaskStatus.DONE })).rejects.toThrow(NotFoundException);
    });
  });
});
