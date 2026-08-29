import { NotFoundException } from '@nestjs/common';
import { AIAnalysisStatus, AIAnalysisType, OrgRole } from '@prisma/client';
import { AiAnalysisService } from './ai-analysis.service';

function buildTxMock() {
  return {
    aIAnalysis: { create: jest.fn(), findUnique: jest.fn() },
    lead: { findUnique: jest.fn() },
  };
}

describe('AiAnalysisService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let queueAdd: jest.Mock;

  function buildService(role: OrgRole = OrgRole.OWNER) {
    tx = buildTxMock();
    queueAdd = jest.fn();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new AiAnalysisService(tenantContext as any, { add: queueAdd } as any);
  }

  describe('requestAnalysis', () => {
    it('creates a PENDING row and enqueues a job carrying its id', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: null });
      tx.aIAnalysis.create.mockResolvedValue({ id: 'analysis-1' });

      const result = await service.requestAnalysis('lead-1', { type: AIAnalysisType.SCORE });

      expect(result).toEqual({ analysisId: 'analysis-1' });
      expect(tx.aIAnalysis.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', leadId: 'lead-1', type: AIAnalysisType.SCORE },
      });
      expect(queueAdd).toHaveBeenCalledWith(
        'analyze-lead',
        expect.objectContaining({ analysisId: 'analysis-1', leadId: 'lead-1', type: AIAnalysisType.SCORE }),
      );
    });

    it('404s for a lead that does not exist in this organization', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue(null);

      await expect(service.requestAnalysis('ghost-lead', { type: AIAnalysisType.SCORE })).rejects.toThrow(NotFoundException);
      expect(tx.aIAnalysis.create).not.toHaveBeenCalled();
    });

    it('404s for a SALES_REP requesting analysis on a lead they do not own (row-scope, not RBAC)', async () => {
      const service = buildService(OrgRole.SALES_REP);
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: 'someone-else' });

      await expect(service.requestAnalysis('lead-1', { type: AIAnalysisType.SCORE })).rejects.toThrow(NotFoundException);
    });
  });

  describe('getAnalysis', () => {
    it('never returns rawOutput, even though the row has it', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: null });
      tx.aIAnalysis.findUnique.mockResolvedValue({
        id: 'analysis-1',
        organizationId: 'org-1',
        leadId: 'lead-1',
        type: AIAnalysisType.SCORE,
        status: AIAnalysisStatus.COMPLETED,
        score: 87,
        classification: 'High Intent',
        reasons: ['Enterprise'],
        recommendedAction: 'Call today',
        rawOutput: { secret: 'internal provider payload' },
        errorMessage: null,
        createdAt: new Date('2026-01-01'),
      });

      const result = await service.getAnalysis('lead-1', 'analysis-1');

      expect(result).not.toHaveProperty('rawOutput');
      expect(result.score).toBe(87);
    });

    it('404s when the analysis belongs to a different lead', async () => {
      const service = buildService();
      tx.lead.findUnique.mockResolvedValue({ id: 'lead-1', ownerId: null });
      tx.aIAnalysis.findUnique.mockResolvedValue({ id: 'analysis-1', leadId: 'some-other-lead' });

      await expect(service.getAnalysis('lead-1', 'analysis-1')).rejects.toThrow(NotFoundException);
    });
  });
});
