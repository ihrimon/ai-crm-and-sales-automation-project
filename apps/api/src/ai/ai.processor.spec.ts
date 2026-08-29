import { AIAnalysisStatus, AIAnalysisType, EmailDraftStatus, OrgRole } from '@prisma/client';
import type { Job } from 'bullmq';
import { AI_JOB_MAX_ATTEMPTS } from '../common/queue/queue.module';
import { AiProcessor } from './ai.processor';
import type { AnalyzeLeadJobData } from './ai-analysis.service';
import type { GenerateEmailJobData } from './email-draft.service';
import { AiInvalidOutputError, AiProviderUnavailableError } from './provider/ai-provider.errors';

function buildTxMock() {
  return {
    aIAnalysis: { update: jest.fn() },
    emailDraft: { update: jest.fn() },
    lead: { findUniqueOrThrow: jest.fn() },
    activity: { findMany: jest.fn() },
  };
}

function buildTenantContextMock(tx: ReturnType<typeof buildTxMock>) {
  return {
    tx,
    // Mirrors the real method's contract closely enough for a unit test:
    // just invoke the callback, with `tx` already wired above (the real
    // implementation's transaction/set_config mechanics aren't what this
    // test is verifying — that's covered by the integration test instead).
    runInNewTenantTransaction: jest.fn(async (_prisma: unknown, _store: unknown, fn: () => Promise<unknown>) => fn()),
  };
}

const ANALYZE_JOB_DATA: AnalyzeLeadJobData = {
  analysisId: 'analysis-1',
  organizationId: 'org-1',
  leadId: 'lead-1',
  type: AIAnalysisType.SCORE,
  userId: 'user-1',
  role: OrgRole.OWNER,
  memberId: 'member-1',
};

const EMAIL_JOB_DATA: GenerateEmailJobData = {
  emailDraftId: 'draft-1',
  organizationId: 'org-1',
  leadId: 'lead-1',
  tone: 'friendly',
  userId: 'user-1',
  role: OrgRole.OWNER,
  memberId: 'member-1',
};

function buildJob<T>(name: string, data: T, attemptsMade = 0): Job<T> {
  return { id: 'job-1', name, data, attemptsMade } as unknown as Job<T>;
}

describe('AiProcessor', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tenantContext: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let provider: any;
  let processor: AiProcessor;

  beforeEach(() => {
    tx = buildTxMock();
    tenantContext = buildTenantContextMock(tx);
    provider = { score: jest.fn(), qualify: jest.fn(), summarize: jest.fn(), generateEmail: jest.fn() };
    tx.lead.findUniqueOrThrow.mockResolvedValue({
      id: 'lead-1',
      name: 'Jane Prospect',
      industry: 'Software',
      jobTitle: 'VP',
      budget: null,
      source: 'Webinar',
      company: { name: 'Acme', companySize: '200-500' },
    });
    tx.activity.findMany.mockResolvedValue([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    processor = new AiProcessor({} as any, tenantContext, provider);
  });

  describe('processAnalyzeLead — happy paths', () => {
    it('SCORE: stores a COMPLETED row with the validated fields', async () => {
      provider.score.mockResolvedValue({ score: 87, classification: 'High', reasons: ['Enterprise'], recommendedAction: 'Call today' });

      await processor.process(buildJob('analyze-lead', ANALYZE_JOB_DATA));

      expect(tx.aIAnalysis.update).toHaveBeenCalledWith({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({ status: AIAnalysisStatus.COMPLETED, score: 87, classification: 'High' }),
      });
    });

    it('QUALIFICATION: stores classification + reasons, no score', async () => {
      provider.qualify.mockResolvedValue({ classification: 'High', reasons: ['Decision maker'] });

      await processor.process(buildJob('analyze-lead', { ...ANALYZE_JOB_DATA, type: AIAnalysisType.QUALIFICATION }));

      expect(tx.aIAnalysis.update).toHaveBeenCalledWith({
        where: { id: 'analysis-1' },
        data: expect.objectContaining({ status: AIAnalysisStatus.COMPLETED, classification: 'High', reasons: ['Decision maker'] }),
      });
    });

    it('SUMMARY: maps the structured Intent/PainPoints/ActionItems/NextFollowUp shape onto reasons[]', async () => {
      provider.summarize.mockResolvedValue({
        intent: 'Evaluate pricing',
        painPoints: ['Budget constraints'],
        actionItems: ['Send proposal'],
        nextFollowUp: 'Next Tuesday',
      });

      await processor.process(buildJob('analyze-lead', { ...ANALYZE_JOB_DATA, type: AIAnalysisType.SUMMARY }));

      const call = tx.aIAnalysis.update.mock.calls[0][0];
      expect(call.data.status).toBe(AIAnalysisStatus.COMPLETED);
      expect(call.data.reasons).toEqual(
        expect.arrayContaining([
          'Intent: Evaluate pricing',
          'Pain Point: Budget constraints',
          'Action Item: Send proposal',
          'Next Follow-up: Next Tuesday',
        ]),
      );
      expect(call.data.recommendedAction).toBe('Next Tuesday');
    });
  });

  describe('force-fail handling (M6 Definition of Done)', () => {
    it('an invalid provider response is never stored as a COMPLETED row — marked FAILED with a safe message instead', async () => {
      provider.score.mockRejectedValue(new AiInvalidOutputError());

      await processor.process(buildJob('analyze-lead', ANALYZE_JOB_DATA));

      expect(tx.aIAnalysis.update).toHaveBeenCalledTimes(1);
      const call = tx.aIAnalysis.update.mock.calls[0][0];
      expect(call.data.status).toBe(AIAnalysisStatus.FAILED);
      expect(call.data.errorMessage).toBe('The AI provider returned an unexpected response.');
      // Never a COMPLETED write with score/classification et al. from a
      // malformed response.
      expect(call.data.score).toBeUndefined();
    });

    it('a provider-unavailable error on a non-final attempt is rethrown for BullMQ to retry, and does NOT mark the row FAILED yet', async () => {
      provider.score.mockRejectedValue(new AiProviderUnavailableError());

      const attempt = processor.process(buildJob('analyze-lead', ANALYZE_JOB_DATA, 0));

      await expect(attempt).rejects.toThrow(AiProviderUnavailableError);
      expect(tx.aIAnalysis.update).not.toHaveBeenCalled();
    });

    it('a provider-unavailable error on the final attempt is recorded as a terminal FAILED, not rethrown', async () => {
      provider.score.mockRejectedValue(new AiProviderUnavailableError());

      await expect(
        processor.process(buildJob('analyze-lead', ANALYZE_JOB_DATA, AI_JOB_MAX_ATTEMPTS - 1)),
      ).resolves.toBeUndefined();

      expect(tx.aIAnalysis.update).toHaveBeenCalledWith({
        where: { id: 'analysis-1' },
        data: { status: AIAnalysisStatus.FAILED, errorMessage: expect.any(String) },
      });
    });

    it('an unexpected error never leaks its raw message to the stored row', async () => {
      provider.score.mockRejectedValue(new Error('Internal secret DB connection string leaked in error: postgres://user:pw@host'));

      await processor.process(buildJob('analyze-lead', ANALYZE_JOB_DATA, AI_JOB_MAX_ATTEMPTS - 1));

      const call = tx.aIAnalysis.update.mock.calls[0][0];
      expect(call.data.status).toBe(AIAnalysisStatus.FAILED);
      expect(call.data.errorMessage).not.toContain('postgres://');
      expect(call.data.errorMessage).toBe('Something went wrong while processing this request.');
    });
  });

  describe('processGenerateEmail', () => {
    it('happy path: stores DRAFT status with subject/body', async () => {
      provider.generateEmail.mockResolvedValue({ subject: 'Following up', body: 'Hi Jane,' });

      await processor.process(buildJob('generate-email', EMAIL_JOB_DATA));

      expect(tx.emailDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: { status: EmailDraftStatus.DRAFT, subject: 'Following up', body: 'Hi Jane,' },
      });
    });

    it('a malformed response marks the draft FAILED with a safe message, never stored as DRAFT', async () => {
      provider.generateEmail.mockRejectedValue(new AiInvalidOutputError());

      await processor.process(buildJob('generate-email', EMAIL_JOB_DATA));

      expect(tx.emailDraft.update).toHaveBeenCalledWith({
        where: { id: 'draft-1' },
        data: { status: EmailDraftStatus.FAILED, errorMessage: expect.any(String) },
      });
    });
  });
});
