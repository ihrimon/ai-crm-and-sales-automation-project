import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationExecutionStatus, OrgRole } from '@prisma/client';
import { AutomationExecutionService } from './automation-execution.service';
import { AiInvalidOutputError } from '../ai/provider/ai-provider.errors';

function buildTxMock() {
  return {
    automationExecution: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    lead: { findUniqueOrThrow: jest.fn() },
    deal: { findUniqueOrThrow: jest.fn() },
    emailDraft: { create: jest.fn() },
  };
}

describe('AutomationExecutionService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let provider: { generateEmail: jest.Mock };

  function buildService(role: OrgRole = OrgRole.OWNER, memberId = 'member-1') {
    tx = buildTxMock();
    provider = { generateEmail: jest.fn() };
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId, role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AutomationExecutionService(tenantContext as any, provider as never);
  }

  describe('findAll — row-scope', () => {
    it('a SALES_REP only sees executions on leads/deals they own', async () => {
      const service = buildService(OrgRole.SALES_REP, 'member-2');
      tx.automationExecution.findMany.mockResolvedValue([]);
      tx.automationExecution.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20 });

      expect(tx.automationExecution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ lead: { ownerId: 'member-2' } }, { deal: { ownerId: 'member-2' } }] },
        }),
      );
    });

    it('OWNER sees everything (no row-scope filter)', async () => {
      const service = buildService(OrgRole.OWNER);
      tx.automationExecution.findMany.mockResolvedValue([]);
      tx.automationExecution.count.mockResolvedValue(0);

      await service.findAll({ page: 1, pageSize: 20 });

      expect(tx.automationExecution.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });
  });

  describe('approve — CALL_AI executions only, generates + stores an EmailDraft (FR-052 🔎)', () => {
    it('happy path: generates an email, creates a DRAFT EmailDraft, marks EXECUTED', async () => {
      const service = buildService();
      tx.automationExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        leadId: 'lead-1',
        dealId: null,
        status: AutomationExecutionStatus.PENDING_APPROVAL,
        lead: { ownerId: null },
        deal: null,
      });
      tx.lead.findUniqueOrThrow.mockResolvedValue({ id: 'lead-1', name: 'Jane', jobTitle: 'VP', contactId: null, company: { name: 'Acme' } });
      provider.generateEmail.mockResolvedValue({ subject: 'Following up', body: 'Hi Jane,' });
      tx.emailDraft.create.mockResolvedValue({ id: 'draft-1' });
      tx.automationExecution.update.mockResolvedValue({ id: 'exec-1', status: AutomationExecutionStatus.EXECUTED });

      await service.approve('exec-1');

      expect(tx.emailDraft.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ leadId: 'lead-1', subject: 'Following up', body: 'Hi Jane,', status: 'DRAFT' }),
      });
      expect(tx.automationExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({
          status: AutomationExecutionStatus.EXECUTED,
          resultJson: { emailDraftId: 'draft-1', subject: 'Following up', body: 'Hi Jane,' },
          reviewedById: 'member-1',
        }),
      });
    });

    it('rejects (400) an execution that is not PENDING_APPROVAL', async () => {
      const service = buildService();
      tx.automationExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        status: AutomationExecutionStatus.EXECUTED,
        lead: null,
        deal: null,
      });

      await expect(service.approve('exec-1')).rejects.toThrow(BadRequestException);
    });

    it('404s for a SALES_REP approving an execution on a lead they do not own', async () => {
      const service = buildService(OrgRole.SALES_REP, 'member-2');
      tx.automationExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        status: AutomationExecutionStatus.PENDING_APPROVAL,
        lead: { ownerId: 'someone-else' },
        deal: null,
      });

      await expect(service.approve('exec-1')).rejects.toThrow(NotFoundException);
    });

    it('a provider failure marks the execution FAILED with a safe message and throws a 400 (never a malformed EXECUTED row)', async () => {
      const service = buildService();
      tx.automationExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        leadId: 'lead-1',
        dealId: null,
        status: AutomationExecutionStatus.PENDING_APPROVAL,
        lead: { ownerId: null },
        deal: null,
      });
      tx.lead.findUniqueOrThrow.mockResolvedValue({ id: 'lead-1', name: 'Jane', jobTitle: null, contactId: null, company: null });
      provider.generateEmail.mockRejectedValue(new AiInvalidOutputError());

      await expect(service.approve('exec-1')).rejects.toThrow(BadRequestException);

      expect(tx.emailDraft.create).not.toHaveBeenCalled();
      expect(tx.automationExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: AutomationExecutionStatus.FAILED, error: expect.any(String) }),
      });
    });
  });

  describe('reject', () => {
    it('marks the execution DISMISSED', async () => {
      const service = buildService();
      tx.automationExecution.findUnique.mockResolvedValue({
        id: 'exec-1',
        status: AutomationExecutionStatus.PENDING_APPROVAL,
        lead: null,
        deal: null,
      });
      tx.automationExecution.update.mockResolvedValue({ id: 'exec-1', status: AutomationExecutionStatus.DISMISSED });

      await service.reject('exec-1');

      expect(tx.automationExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: expect.objectContaining({ status: AutomationExecutionStatus.DISMISSED, reviewedById: 'member-1' }),
      });
    });
  });
});
