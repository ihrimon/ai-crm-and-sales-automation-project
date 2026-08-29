import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { AIAnalysisStatus, AIAnalysisType, EmailDraftStatus } from '@prisma/client';
import type { Job } from 'bullmq';
import { PrismaService } from '../common/prisma/prisma.service';
import { AI_JOB_MAX_ATTEMPTS, AI_QUEUE_NAME, ANALYZE_LEAD_JOB, GENERATE_EMAIL_JOB } from '../common/queue/queue.module';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { AnalyzeLeadJobData } from './ai-analysis.service';
import type { GenerateEmailJobData } from './email-draft.service';
import { AiInvalidOutputError, AiProviderUnavailableError } from './provider/ai-provider.errors';
import { AI_PROVIDER_ADAPTER, type AiProviderAdapter, type LeadContext } from './provider/ai-provider.interface';

// architecture/README.md §6.2: the worker half of the async flow. Runs
// in-process (see queue.module.ts) but deliberately never touches
// TenantContextService.tx directly the way an HTTP-request-scoped service
// would — there is no TenantScopeInterceptor wrapping a queue job, so every
// DB operation here goes through
// tenantContext.runInNewTenantTransaction(...), which does that wrapping
// itself (docs/database/README.md §5.6 on why this matters).
@Processor(AI_QUEUE_NAME)
export class AiProcessor extends WorkerHost {
  private readonly logger = new Logger(AiProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Inject(AI_PROVIDER_ADAPTER) private readonly provider: AiProviderAdapter,
  ) {
    super();
  }

  async process(job: Job<AnalyzeLeadJobData | GenerateEmailJobData>): Promise<void> {
    if (job.name === ANALYZE_LEAD_JOB) {
      await this.processAnalyzeLead(job as Job<AnalyzeLeadJobData>);
    } else if (job.name === GENERATE_EMAIL_JOB) {
      await this.processGenerateEmail(job as Job<GenerateEmailJobData>);
    }
  }

  private async processAnalyzeLead(job: Job<AnalyzeLeadJobData>): Promise<void> {
    const { analysisId, organizationId, leadId, type, userId, role, memberId } = job.data;

    try {
      await this.tenantContext.runInNewTenantTransaction(this.prisma, { organizationId, userId, role, memberId }, async () => {
        const context = await this.buildLeadContext(leadId);

        if (type === AIAnalysisType.SUMMARY) {
          const conversationText = context.recentActivity.join('\n');
          const summary = await this.provider.summarize(conversationText);
          await this.tenantContext.tx.aIAnalysis.update({
            where: { id: analysisId },
            data: {
              status: AIAnalysisStatus.COMPLETED,
              classification: null,
              score: null,
              // Structured Intent/Pain Points/Action Items/Next Follow-up
              // (guideline/04-ai-features.md §9.4 🔎) mapped onto the
              // contract's flat `reasons: string[]` — AIAnalysis has no
              // dedicated summary-shape fields (docs/api/openapi.yaml).
              reasons: [
                `Intent: ${summary.intent}`,
                ...summary.painPoints.map((p) => `Pain Point: ${p}`),
                ...summary.actionItems.map((a) => `Action Item: ${a}`),
                `Next Follow-up: ${summary.nextFollowUp}`,
              ],
              recommendedAction: summary.nextFollowUp,
              rawOutput: summary as object,
            },
          });
        } else if (type === AIAnalysisType.QUALIFICATION) {
          const result = await this.provider.qualify(context);
          await this.tenantContext.tx.aIAnalysis.update({
            where: { id: analysisId },
            data: {
              status: AIAnalysisStatus.COMPLETED,
              classification: result.classification,
              reasons: result.reasons,
              rawOutput: result as object,
            },
          });
        } else {
          const result = await this.provider.score(context);
          await this.tenantContext.tx.aIAnalysis.update({
            where: { id: analysisId },
            data: {
              status: AIAnalysisStatus.COMPLETED,
              score: result.score,
              classification: result.classification,
              reasons: result.reasons,
              recommendedAction: result.recommendedAction,
              rawOutput: result as object,
            },
          });
        }
      });
    } catch (err) {
      await this.handleFailure(job, err, async (message) => {
        await this.tenantContext.runInNewTenantTransaction(this.prisma, { organizationId, userId, role, memberId }, () =>
          this.tenantContext.tx.aIAnalysis.update({
            where: { id: analysisId },
            data: { status: AIAnalysisStatus.FAILED, errorMessage: message },
          }),
        );
      });
    }
  }

  private async processGenerateEmail(job: Job<GenerateEmailJobData>): Promise<void> {
    const { emailDraftId, organizationId, leadId, tone, userId, role, memberId } = job.data;

    try {
      await this.tenantContext.runInNewTenantTransaction(this.prisma, { organizationId, userId, role, memberId }, async () => {
        const lead = await this.tenantContext.tx.lead.findUniqueOrThrow({
          where: { id: leadId },
          include: { company: true },
        });
        const result = await this.provider.generateEmail({
          leadName: lead.name,
          companyName: lead.company?.name ?? null,
          jobTitle: lead.jobTitle,
          tone,
        });
        await this.tenantContext.tx.emailDraft.update({
          where: { id: emailDraftId },
          data: { status: EmailDraftStatus.DRAFT, subject: result.subject, body: result.body },
        });
      });
    } catch (err) {
      await this.handleFailure(job, err, async (message) => {
        await this.tenantContext.runInNewTenantTransaction(this.prisma, { organizationId, userId, role, memberId }, () =>
          this.tenantContext.tx.emailDraft.update({
            where: { id: emailDraftId },
            data: { status: EmailDraftStatus.FAILED, errorMessage: message },
          }),
        );
      });
    }
  }

  // FR-041, NFR-039, UC-014: a malformed/invalid response is never worth
  // retrying (the same prompt will likely produce the same shape again), so
  // it fails the row immediately. A provider-unavailable error (timeout,
  // network, rate limit) IS worth retrying — rethrown so BullMQ's
  // backoff (queue.module.ts) retries it, except on the last allowed
  // attempt, where it's recorded as a terminal failure the same way. Either
  // way the row only ever gets a safe, pre-written message — never the raw
  // provider error or a stack trace.
  private async handleFailure(job: Job, err: unknown, markFailed: (message: string) => Promise<unknown>): Promise<void> {
    if (err instanceof AiProviderUnavailableError) {
      const isLastAttempt = job.attemptsMade + 1 >= AI_JOB_MAX_ATTEMPTS;
      if (!isLastAttempt) {
        this.logger.warn(`AI provider unavailable (attempt ${job.attemptsMade + 1}/${AI_JOB_MAX_ATTEMPTS}), will retry: ${job.id}`);
        throw err; // let BullMQ retry with backoff
      }
      this.logger.error(`AI provider unavailable, all ${AI_JOB_MAX_ATTEMPTS} attempts exhausted for job ${job.id}`);
      await markFailed(err.message);
      return;
    }

    if (err instanceof AiInvalidOutputError) {
      this.logger.error(`AI provider returned an invalid response for job ${job.id}`);
      await markFailed(err.message);
      return;
    }

    // Unexpected error (e.g. the lead was deleted mid-flight) — log full
    // detail server-side only, never expose it to the client.
    this.logger.error(`Unexpected error processing AI job ${job.id}`, err instanceof Error ? err.stack : String(err));
    await markFailed('Something went wrong while processing this request.');
  }

  private async buildLeadContext(leadId: string): Promise<LeadContext> {
    const lead = await this.tenantContext.tx.lead.findUniqueOrThrow({
      where: { id: leadId },
      include: { company: true },
    });
    const activities = await this.tenantContext.tx.activity.findMany({
      where: { leadId, notes: { not: null } },
      orderBy: { occurredAt: 'desc' },
      take: 10,
    });

    return {
      industry: lead.industry,
      jobTitle: lead.jobTitle,
      budget: lead.budget ? Number(lead.budget) : null,
      source: lead.source,
      companyName: lead.company?.name ?? null,
      companySize: lead.company?.companySize ?? null,
      recentActivity: activities.map((a) => a.notes as string),
    };
  }
}
