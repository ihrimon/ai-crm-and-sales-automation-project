import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AutomationExecutionStatus, EmailDraftStatus, OrgRole, type Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { AiInvalidOutputError, AiProviderUnavailableError } from '../ai/provider/ai-provider.errors';
import { AI_PROVIDER_ADAPTER, type AiProviderAdapter, type EmailContext } from '../ai/provider/ai-provider.interface';
import type { ListExecutionsQueryDto } from './dto/list-executions-query.dto';

// FR-045, FR-052 🔎. `approve()` is where a CALL_AI execution's AI call
// actually happens (architecture/README.md §6.3: nothing runs until a human
// approves it) — synchronously, matching docs/api/openapi.yaml's approve
// operation returning a plain 200 with status already EXECUTED, not a 202
// (unlike every other AI call in this codebase, M6's ai-analyses/
// email-drafts, which are async 202-then-poll). A single provider call from
// a manual approve click is an acceptable synchronous wait; this is not a
// bulk/high-throughput path.
@Injectable()
export class AutomationExecutionService {
  constructor(
    private readonly tenantContext: TenantContextService,
    @Inject(AI_PROVIDER_ADAPTER) private readonly provider: AiProviderAdapter,
  ) {}

  async findAll(query: ListExecutionsQueryDto) {
    const { page, pageSize, status } = query;
    const where: Prisma.AutomationExecutionWhereInput = {};
    if (status) where.status = status;

    // docs/api/openapi.yaml: "SALES_REP sees only executions on Leads/Deals
    // they own" — same row-level-beyond-role shape as Lead/Deal/Deal list.
    if (this.tenantContext.role === OrgRole.SALES_REP) {
      where.OR = [{ lead: { ownerId: this.tenantContext.memberId } }, { deal: { ownerId: this.tenantContext.memberId } }];
    }

    const [data, total] = await Promise.all([
      this.tenantContext.tx.automationExecution.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.automationExecution.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async approve(executionId: string) {
    const execution = await this.findPendingApprovalOrThrow(executionId);
    const emailContext = await this.buildEmailContext(execution);

    try {
      const result = await this.provider.generateEmail(emailContext);
      const draft = await this.tenantContext.tx.emailDraft.create({
        data: {
          organizationId: this.tenantContext.organizationId,
          leadId: execution.leadId,
          contactId: emailContext.contactId ?? null,
          createdById: this.tenantContext.memberId,
          subject: result.subject,
          body: result.body,
          status: EmailDraftStatus.DRAFT,
        },
      });
      return this.tenantContext.tx.automationExecution.update({
        where: { id: executionId },
        data: {
          status: AutomationExecutionStatus.EXECUTED,
          resultJson: { emailDraftId: draft.id, subject: result.subject, body: result.body },
          reviewedById: this.tenantContext.memberId,
          reviewedAt: new Date(),
        },
      });
    } catch (err) {
      const message =
        err instanceof AiProviderUnavailableError || err instanceof AiInvalidOutputError
          ? err.message
          : 'Could not execute this automation action.';
      await this.tenantContext.tx.automationExecution.update({
        where: { id: executionId },
        data: {
          status: AutomationExecutionStatus.FAILED,
          error: message,
          reviewedById: this.tenantContext.memberId,
          reviewedAt: new Date(),
        },
      });
      throw new BadRequestException({ code: 'AUTOMATION_ACTION_FAILED', message });
    }
  }

  async reject(executionId: string) {
    await this.findPendingApprovalOrThrow(executionId);
    return this.tenantContext.tx.automationExecution.update({
      where: { id: executionId },
      data: {
        status: AutomationExecutionStatus.DISMISSED,
        reviewedById: this.tenantContext.memberId,
        reviewedAt: new Date(),
      },
    });
  }

  // Same 404-not-403 row-scope convention as every other owned resource
  // (docs/api/README.md's "(own)" qualifier on approve/reject) — a
  // non-owning SALES_REP gets 404, not 403.
  private async findPendingApprovalOrThrow(executionId: string) {
    const execution = await this.tenantContext.tx.automationExecution.findUnique({
      where: { id: executionId },
      include: { lead: true, deal: true },
    });
    if (!execution) {
      throw new NotFoundException('Automation execution not found.');
    }
    if (this.tenantContext.role === OrgRole.SALES_REP) {
      const owns = execution.lead?.ownerId === this.tenantContext.memberId || execution.deal?.ownerId === this.tenantContext.memberId;
      if (!owns) {
        throw new NotFoundException('Automation execution not found.');
      }
    }
    if (execution.status !== AutomationExecutionStatus.PENDING_APPROVAL) {
      throw new BadRequestException({
        code: 'EXECUTION_NOT_PENDING_APPROVAL',
        message: 'This execution is not awaiting approval.',
      });
    }
    return execution;
  }

  // CALL_AI executions are normally lead-triggered (LEAD_CREATED/NO_RESPONSE
  // always carry a leadId) — the deal-triggered case falls back to the
  // deal's own linked contact/company so approve() still has something
  // sensible to draft an email about.
  private async buildEmailContext(execution: {
    leadId: string | null;
    dealId: string | null;
  }): Promise<EmailContext & { contactId?: string | null }> {
    if (execution.leadId) {
      const lead = await this.tenantContext.tx.lead.findUniqueOrThrow({
        where: { id: execution.leadId },
        include: { company: true },
      });
      return { leadName: lead.name, companyName: lead.company?.name ?? null, jobTitle: lead.jobTitle, tone: null, contactId: lead.contactId };
    }
    if (execution.dealId) {
      const deal = await this.tenantContext.tx.deal.findUniqueOrThrow({
        where: { id: execution.dealId },
        include: { company: true, contact: true },
      });
      return {
        leadName: deal.contact?.name ?? deal.title,
        companyName: deal.company?.name ?? null,
        jobTitle: deal.contact?.position ?? null,
        tone: null,
        contactId: deal.contactId,
      };
    }
    throw new BadRequestException({
      code: 'EXECUTION_MISSING_CONTEXT',
      message: 'This execution has no associated lead or deal.',
    });
  }
}
