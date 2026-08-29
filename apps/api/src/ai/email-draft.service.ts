import { InjectQueue } from '@nestjs/bullmq';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import type { Queue } from 'bullmq';
import { AI_QUEUE_NAME, GENERATE_EMAIL_JOB } from '../common/queue/queue.module';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateEmailDraftDto } from './dto/create-email-draft.dto';
import type { UpdateEmailDraftDto } from './dto/update-email-draft.dto';

const MANAGER_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER];

export interface GenerateEmailJobData {
  emailDraftId: string;
  organizationId: string;
  leadId: string;
  tone: string | null;
  userId: string;
  role: OrgRole;
  memberId: string;
}

// FR-039. POST enqueues and returns 202 immediately, same pattern as
// ai-analyses (architecture/README.md §6.2, docs/api/openapi.yaml).
@Injectable()
export class EmailDraftService {
  constructor(
    private readonly tenantContext: TenantContextService,
    @InjectQueue(AI_QUEUE_NAME) private readonly queue: Queue<GenerateEmailJobData>,
  ) {}

  async requestDraft(leadId: string, dto: CreateEmailDraftDto): Promise<{ emailDraftId: string }> {
    await this.assertLeadOwnershipScoped(leadId);

    const draft = await this.tenantContext.tx.emailDraft.create({
      data: {
        organizationId: this.tenantContext.organizationId,
        leadId,
        tone: dto.tone,
        createdById: this.tenantContext.memberId,
      },
    });

    await this.queue.add(GENERATE_EMAIL_JOB, {
      emailDraftId: draft.id,
      organizationId: this.tenantContext.organizationId,
      leadId,
      tone: dto.tone ?? null,
      userId: this.tenantContext.userId,
      role: this.tenantContext.role,
      memberId: this.tenantContext.memberId,
    });

    return { emailDraftId: draft.id };
  }

  // docs/api/README.md §4: PATCH is "creator, OWNER, ADMIN" — deliberately
  // narrower than the Task write-permission split (§M5), which also allows
  // SALES_MANAGER. Not this project's convention to blur the two.
  async updateDraft(emailDraftId: string, dto: UpdateEmailDraftDto) {
    const draft = await this.findExistingOrThrow(emailDraftId);
    const isCreator = draft.createdById === this.tenantContext.memberId;
    const isOwnerOrAdmin = this.tenantContext.role === OrgRole.OWNER || this.tenantContext.role === OrgRole.ADMIN;
    if (!isCreator && !isOwnerOrAdmin) {
      throw new ForbiddenException('Only the creator, OWNER, or ADMIN can edit this draft.');
    }

    return this.tenantContext.tx.emailDraft.update({ where: { id: emailDraftId }, data: dto });
  }

  // Added in M6 alongside the endpoint itself — GET /email-drafts/:id was
  // missing from the original contract even though "Draft generation
  // accepted (async, same pattern as ai-analyses)" (docs/api/openapi.yaml)
  // implies the same poll-until-COMPLETED flow, which needs somewhere to
  // poll. Reads are deliberately broader than writes (updateDraft() above):
  // any manager-tier role, or the creator specifically, same 404-not-403
  // row-scope convention as Lead/Deal/Task for a non-creator SALES_REP.
  async getDraft(emailDraftId: string) {
    const draft = await this.findExistingOrThrow(emailDraftId);
    const isCreator = draft.createdById === this.tenantContext.memberId;
    const isManagerTier = MANAGER_ROLES.includes(this.tenantContext.role);
    if (!isCreator && !isManagerTier) {
      throw new NotFoundException('Email draft not found.');
    }
    return draft;
  }

  private async findExistingOrThrow(emailDraftId: string) {
    const draft = await this.tenantContext.tx.emailDraft.findUnique({ where: { id: emailDraftId } });
    if (!draft) {
      throw new NotFoundException('Email draft not found.');
    }
    return draft;
  }

  private async assertLeadOwnershipScoped(leadId: string): Promise<void> {
    const lead = await this.tenantContext.tx.lead.findUnique({ where: { id: leadId } });
    if (!lead || (this.tenantContext.role === OrgRole.SALES_REP && lead.ownerId !== this.tenantContext.memberId)) {
      throw new NotFoundException('Lead not found.');
    }
  }
}
