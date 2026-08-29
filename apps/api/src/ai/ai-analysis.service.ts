import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, NotFoundException } from '@nestjs/common';
import { AIAnalysisType, OrgRole } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AI_QUEUE_NAME, ANALYZE_LEAD_JOB } from '../common/queue/queue.module';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { RequestAiAnalysisDto } from './dto/request-ai-analysis.dto';

export interface AnalyzeLeadJobData {
  analysisId: string;
  organizationId: string;
  leadId: string;
  type: AIAnalysisType;
  userId: string;
  role: OrgRole;
  memberId: string;
}

// FR-036–FR-038, FR-040, FR-051 🔎. POST enqueues and returns 202 immediately
// (architecture/README.md §6.2) — the actual AI call happens in AiProcessor.
@Injectable()
export class AiAnalysisService {
  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectQueue(AI_QUEUE_NAME) private readonly queue: Queue<AnalyzeLeadJobData>,
  ) {}

  async requestAnalysis(leadId: string, dto: RequestAiAnalysisDto): Promise<{ analysisId: string }> {
    await this.assertLeadOwnershipScoped(leadId);

    const analysis = await this.tenantContext.tx.aIAnalysis.create({
      data: {
        organizationId: this.tenantContext.organizationId,
        leadId,
        type: dto.type,
      },
    });

    await this.queue.add(ANALYZE_LEAD_JOB, {
      analysisId: analysis.id,
      organizationId: this.tenantContext.organizationId,
      leadId,
      type: dto.type,
      userId: this.tenantContext.userId,
      role: this.tenantContext.role,
      memberId: this.tenantContext.memberId,
    });

    return { analysisId: analysis.id };
  }

  async getAnalysis(leadId: string, analysisId: string) {
    await this.assertLeadOwnershipScoped(leadId);

    const analysis = await this.tenantContext.tx.aIAnalysis.findUnique({ where: { id: analysisId } });
    if (!analysis || analysis.leadId !== leadId) {
      throw new NotFoundException('AI analysis not found.');
    }

    // rawOutput is intentionally never returned over the API (ADR-007: the
    // rest of the system only ever sees a validated, provider-neutral
    // result) — same explicit-mapping pattern AuthService.toPublicUser()
    // uses to keep passwordHash out of responses.
    return {
      id: analysis.id,
      organizationId: analysis.organizationId,
      leadId: analysis.leadId,
      type: analysis.type,
      status: analysis.status,
      score: analysis.score,
      classification: analysis.classification,
      reasons: analysis.reasons,
      recommendedAction: analysis.recommendedAction,
      errorMessage: analysis.errorMessage,
      createdAt: analysis.createdAt,
    };
  }

  // Same row-level rule, and the same 404-not-403 convention, as Leads
  // themselves (docs/api/README.md §2: "don't confirm existence of a lead
  // the caller can't see") — all roles, but SALES_REP only for leads they own.
  private async assertLeadOwnershipScoped(leadId: string): Promise<void> {
    const lead = await this.tenantContext.tx.lead.findUnique({ where: { id: leadId } });
    if (!lead || (this.tenantContext.role === OrgRole.SALES_REP && lead.ownerId !== this.tenantContext.memberId)) {
      throw new NotFoundException('Lead not found.');
    }
  }
}
