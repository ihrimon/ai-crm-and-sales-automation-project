import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmailDraftStatus, OrgRole } from '@prisma/client';
import { EmailDraftService } from './email-draft.service';

function buildTxMock() {
  return {
    emailDraft: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    lead: { findUnique: jest.fn() },
  };
}

describe('EmailDraftService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let queueAdd: jest.Mock;

  function buildService(role: OrgRole = OrgRole.OWNER, memberId = 'member-1') {
    tx = buildTxMock();
    queueAdd = jest.fn();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId, role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new EmailDraftService(tenantContext as any, { add: queueAdd } as any);
  }

  describe('requestDraft', () => {
    it('creates a PENDING draft stamped with the caller as creator, and enqueues a job', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: null });
      tx.emailDraft.create.mockResolvedValue({ id: 'draft-1' });

      const result = await service.requestDraft('lead-1', { tone: 'friendly' });

      expect(result).toEqual({ emailDraftId: 'draft-1' });
      expect(tx.emailDraft.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', leadId: 'lead-1', tone: 'friendly', createdById: 'member-1' },
      });
      expect(queueAdd).toHaveBeenCalledWith('generate-email', expect.objectContaining({ emailDraftId: 'draft-1', leadId: 'lead-1' }));
    });

    it('404s for a SALES_REP requesting a draft on a lead they do not own', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: 'someone-else' });

      await expect(service.requestDraft('lead-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateDraft — write limited to creator, OWNER, or ADMIN (not SALES_MANAGER)', () => {
    it('allows the creator to edit their own draft', async () => {
      const service = buildService(OrgRole.SALES_REP, 'member-1');
      tx.emailDraft.findUnique.mockResolvedValue({ id: 'draft-1', createdById: 'member-1' });
      tx.emailDraft.update.mockResolvedValue({ id: 'draft-1', status: EmailDraftStatus.SENT_MANUALLY });

      await expect(service.updateDraft('draft-1', { status: EmailDraftStatus.SENT_MANUALLY })).resolves.toBeDefined();
    });

    it('rejects a SALES_MANAGER who did not create the draft (narrower than Task write-scope)', async () => {
      const service = buildService(OrgRole.SALES_MANAGER, 'member-2');
      tx.emailDraft.findUnique.mockResolvedValue({ id: 'draft-1', createdById: 'member-1' });

      await expect(service.updateDraft('draft-1', { status: EmailDraftStatus.DISCARDED })).rejects.toThrow(ForbiddenException);
      expect(tx.emailDraft.update).not.toHaveBeenCalled();
    });

    it('allows OWNER regardless of who created it', async () => {
      const service = buildService(OrgRole.OWNER, 'member-owner');
      tx.emailDraft.findUnique.mockResolvedValue({ id: 'draft-1', createdById: 'member-1' });
      tx.emailDraft.update.mockResolvedValue({ id: 'draft-1' });

      await expect(service.updateDraft('draft-1', { status: EmailDraftStatus.DISCARDED })).resolves.toBeDefined();
    });

    it('404s for a draft that does not exist', async () => {
      const service = buildService();
      tx.emailDraft.findUnique.mockResolvedValue(null);

      await expect(service.updateDraft('ghost-draft', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDraft — reads broader than writes', () => {
    it('allows a SALES_MANAGER who did not create the draft to read it (but not edit it)', async () => {
      const service = buildService(OrgRole.SALES_MANAGER, 'member-2');
      tx.emailDraft.findUnique.mockResolvedValue({ id: 'draft-1', createdById: 'member-1' });

      await expect(service.getDraft('draft-1')).resolves.toBeDefined();
    });

    it('404s for a non-creator SALES_REP (same convention as other row-scoped resources)', async () => {
      const service = buildService(OrgRole.SALES_REP, 'member-2');
      tx.emailDraft.findUnique.mockResolvedValue({ id: 'draft-1', createdById: 'member-1' });

      await expect(service.getDraft('draft-1')).rejects.toThrow(NotFoundException);
    });
  });
});
