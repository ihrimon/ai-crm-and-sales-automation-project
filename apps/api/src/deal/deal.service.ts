import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AutomationTriggerType, OrgRole, type Deal, type PipelineStage, type Prisma } from '@prisma/client';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationTriggerService } from '../automation/automation-trigger.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateDealDto } from './dto/create-deal.dto';
import type { ListDealsQueryDto } from './dto/list-deals-query.dto';
import type { MoveDealDto } from './dto/move-deal.dto';
import type { UpdateDealDto } from './dto/update-deal.dto';

// FR-023–FR-026, FR-028. Every query goes through tenantContext.tx
// (RLS-scoped) — see docs/database/README.md §5.6.
@Injectable()
export class DealService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly automationTriggerService: AutomationTriggerService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateDealDto) {
    await this.assertStageInTenant(dto.pipelineStageId);
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);

    const deal = await this.tenantContext.tx.deal.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });
    await this.auditLogService.record({
      entityType: 'Deal',
      entityId: deal.id,
      action: AuditAction.CREATE,
      newValue: deal,
    });
    return deal;
  }

  async findAll(query: ListDealsQueryDto) {
    const { page, pageSize, pipelineStageId, ownerId } = query;
    const where: Prisma.DealWhereInput = {};
    if (pipelineStageId) where.pipelineStageId = pipelineStageId;

    // Row-level scope beyond role (docs/api/README.md §2): SALES_REP only
    // ever sees their own deals — overrides whatever `ownerId` they passed.
    if (this.tenantContext.role === OrgRole.SALES_REP) {
      where.ownerId = this.tenantContext.memberId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    const [data, total] = await Promise.all([
      this.tenantContext.tx.deal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.deal.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    return this.findOwnershipScoped(id);
  }

  async update(id: string, dto: UpdateDealDto) {
    const existing = await this.findOwnershipScoped(id);
    let stage: PipelineStage | undefined;
    if (dto.pipelineStageId) {
      stage = await this.assertStageInTenant(dto.pipelineStageId);
      this.assertLostReasonProvided(stage, dto.lostReason);
    }
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);
    const deal = await this.tenantContext.tx.deal.update({ where: { id }, data: dto });
    await this.auditLogService.record({
      entityType: 'Deal',
      entityId: id,
      action: AuditAction.UPDATE,
      oldValue: existing,
      newValue: deal,
    });
    if (stage) await this.fireDealStageTriggers(deal, stage);
    return deal;
  }

  // FR-025, FR-028: "move" is the sanctioned way a deal changes pipeline
  // stage. AC (docs/development-plan/README.md §M4): moving into an isLost
  // stage without a lostReason is rejected server-side, not just discouraged
  // by the UI prompt (docs/ui-ux/README.md §5.4).
  async move(id: string, dto: MoveDealDto) {
    const existing = await this.findOwnershipScoped(id);
    const stage = await this.assertStageInTenant(dto.pipelineStageId);
    this.assertLostReasonProvided(stage, dto.lostReason);

    const deal = await this.tenantContext.tx.deal.update({
      where: { id },
      data: { pipelineStageId: dto.pipelineStageId, lostReason: dto.lostReason },
    });
    await this.auditLogService.record({
      entityType: 'Deal',
      entityId: id,
      action: AuditAction.UPDATE,
      oldValue: existing,
      newValue: deal,
    });
    await this.fireDealStageTriggers(deal, stage);
    return deal;
  }

  // FR-043 (M7) — DEAL_STAGE_CHANGED fires on every stage change;
  // DEAL_WON additionally fires when the destination stage is a Won stage.
  // Both go through the same defense-in-depth try/catch as
  // LeadService.create()'s LEAD_CREATED trigger: a broken automation must
  // never fail the deal update/move itself.
  private async fireDealStageTriggers(deal: Deal, stage: PipelineStage): Promise<void> {
    const fields = this.buildDealConditionFields(deal, stage);
    try {
      await this.automationTriggerService.evaluateAndExecute(AutomationTriggerType.DEAL_STAGE_CHANGED, {
        dealId: deal.id,
        ownerId: deal.ownerId,
        fields,
      });
      if (stage.isWon) {
        await this.automationTriggerService.evaluateAndExecute(AutomationTriggerType.DEAL_WON, {
          dealId: deal.id,
          ownerId: deal.ownerId,
          fields,
        });
      }
    } catch {
      // deliberately swallowed — see comment above.
    }
  }

  private buildDealConditionFields(deal: Deal, stage: PipelineStage): Record<string, unknown> {
    return {
      value: deal.value ? Number(deal.value) : null,
      currency: deal.currency,
      probability: deal.probability,
      stageName: stage.name,
      isWon: stage.isWon,
      isLost: stage.isLost,
    };
  }

  // GET/PATCH/move: "all roles — SALES_REP only if owner" (docs/api/README.md §3).
  // 404, not 403, matching the NotFound convention used since M2.
  private async findOwnershipScoped(id: string) {
    const deal = await this.findExistingOrThrow(id);
    if (this.tenantContext.role === OrgRole.SALES_REP && deal.ownerId !== this.tenantContext.memberId) {
      throw new NotFoundException('Deal not found.');
    }
    return deal;
  }

  private async findExistingOrThrow(id: string) {
    const deal = await this.tenantContext.tx.deal.findUnique({ where: { id } });
    if (!deal) {
      throw new NotFoundException('Deal not found.');
    }
    return deal;
  }

  private assertLostReasonProvided(stage: { isLost: boolean }, lostReason: string | undefined): void {
    if (stage.isLost && !lostReason) {
      throw new BadRequestException({
        code: 'LOST_REASON_REQUIRED',
        message: 'lostReason is required when moving a deal to a Lost stage.',
      });
    }
  }

  // Cross-tenant reference checks: these tables all have RLS, so an id from
  // a different org simply won't be found — not silently written into a
  // foreign key Postgres itself has no tenant-awareness of.
  private async assertStageInTenant(pipelineStageId: string) {
    const stage = await this.tenantContext.tx.pipelineStage.findUnique({ where: { id: pipelineStageId } });
    if (!stage) {
      throw new BadRequestException({
        code: 'INVALID_PIPELINE_STAGE_ID',
        message: 'pipelineStageId does not exist in this organization.',
      });
    }
    return stage;
  }

  private async assertLeadInTenant(leadId: string): Promise<void> {
    const lead = await this.tenantContext.tx.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      throw new BadRequestException({ code: 'INVALID_LEAD_ID', message: 'leadId does not exist in this organization.' });
    }
  }

  private async assertContactInTenant(contactId: string): Promise<void> {
    const contact = await this.tenantContext.tx.contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new BadRequestException({ code: 'INVALID_CONTACT_ID', message: 'contactId does not exist in this organization.' });
    }
  }

  private async assertCompanyInTenant(companyId: string): Promise<void> {
    const company = await this.tenantContext.tx.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new BadRequestException({ code: 'INVALID_COMPANY_ID', message: 'companyId does not exist in this organization.' });
    }
  }

  private async assertActiveMemberInTenant(memberId: string): Promise<void> {
    const member = await this.tenantContext.tx.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || !member.isActive) {
      throw new BadRequestException({
        code: 'INVALID_OWNER_ID',
        message: 'ownerId does not refer to an active member of this organization.',
      });
    }
  }
}
