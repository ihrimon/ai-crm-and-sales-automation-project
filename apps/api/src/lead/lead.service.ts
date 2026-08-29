import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, AutomationTriggerType, OrgRole, type Lead, type Prisma } from '@prisma/client';
import { AuditLogService } from '../audit/audit-log.service';
import { AutomationTriggerService } from '../automation/automation-trigger.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { AssignLeadDto } from './dto/assign-lead.dto';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';

// FR-013–FR-018, FR-050 🔎. Every query goes through tenantContext.tx
// (RLS-scoped) — see docs/database/README.md §5.6.
@Injectable()
export class LeadService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly automationTriggerService: AutomationTriggerService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async create(dto: CreateLeadDto) {
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);

    const lead = await this.tenantContext.tx.lead.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });

    // FR-050 🔎 — architecture/README.md §6.4: a built-in, non-AI action that
    // runs immediately (no approval step, no queue — that's specifically for
    // AI/slow work per ADR-006). The general Automation engine (Automation/
    // AutomationExecution CRUD + logging) is M7's job; round-robin stays
    // inline here rather than being folded into it — docs/development-plan/
    // README.md §4.1d's call, reconfirmed in §M7: no task in M7's list asks
    // for that refactor, and doing it anyway would risk the FOR UPDATE
    // locking this already-tested path depends on for no required benefit.
    let result = lead;
    if (!dto.ownerId) {
      const assigned = await this.tryRoundRobinAssign(lead.id);
      if (assigned) result = assigned;
    }

    await this.auditLogService.record({
      entityType: 'Lead',
      entityId: result.id,
      action: AuditAction.CREATE,
      newValue: result,
    });

    // FR-043 (M7) — fires after round-robin so LEAD_CREATED automations see
    // the final ownerId. Never allowed to fail lead creation itself: this
    // try/catch is a second line of defense on top of
    // AutomationTriggerService already swallowing per-automation errors.
    try {
      await this.automationTriggerService.evaluateAndExecute(AutomationTriggerType.LEAD_CREATED, {
        leadId: result.id,
        ownerId: result.ownerId,
        fields: this.buildLeadConditionFields(result),
      });
    } catch {
      // deliberately swallowed — see comment above.
    }

    return result;
  }

  private buildLeadConditionFields(lead: Lead): Record<string, unknown> {
    return {
      source: lead.source,
      industry: lead.industry,
      jobTitle: lead.jobTitle,
      budget: lead.budget ? Number(lead.budget) : null,
      status: lead.status,
      score: lead.score,
    };
  }

  async findAll(query: ListLeadsQueryDto) {
    const { page, pageSize, status, ownerId, search, sort } = query;
    const where: Prisma.LeadWhereInput = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Row-level scope beyond role (docs/api/README.md §2): SALES_REP only
    // ever sees their own leads — this overrides whatever `ownerId` they
    // passed, it doesn't just default to it.
    if (this.tenantContext.role === OrgRole.SALES_REP) {
      where.ownerId = this.tenantContext.memberId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    const [field, direction] = sort.startsWith('-') ? [sort.slice(1), 'desc' as const] : [sort, 'asc' as const];

    const [data, total] = await Promise.all([
      this.tenantContext.tx.lead.findMany({
        where,
        orderBy: { [field]: direction },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.lead.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    return this.findOwnershipScoped(id);
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.findOwnershipScoped(id);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);
    const updated = await this.tenantContext.tx.lead.update({ where: { id }, data: dto });
    await this.auditLogService.record({
      entityType: 'Lead',
      entityId: id,
      action: AuditAction.UPDATE,
      oldValue: existing,
      newValue: updated,
    });
    return updated;
  }

  async remove(id: string): Promise<void> {
    // DELETE's x-roles excludes SALES_REP entirely (RbacGuard already blocks
    // it) — no per-row ownership check needed, just tenant-scoped existence.
    const existing = await this.findExistingOrThrow(id);
    await this.tenantContext.tx.lead.delete({ where: { id } });
    await this.auditLogService.record({
      entityType: 'Lead',
      entityId: id,
      action: AuditAction.DELETE,
      oldValue: existing,
    });
  }

  async assign(id: string, dto: AssignLeadDto) {
    // assignLead's x-roles is OWNER/ADMIN/SALES_MANAGER only — any lead in
    // the org, not scoped to the caller's own.
    await this.findExistingOrThrow(id);
    await this.assertActiveMemberInTenant(dto.ownerId);
    return this.tenantContext.tx.lead.update({ where: { id }, data: { ownerId: dto.ownerId } });
  }

  // GET/PATCH: "all roles — SALES_REP only if owner" (docs/api/README.md §3).
  // 404, not 403, matching the NotFound convention used since M2 (don't
  // confirm existence of a lead the caller can't see).
  private async findOwnershipScoped(id: string) {
    const lead = await this.findExistingOrThrow(id);
    if (this.tenantContext.role === OrgRole.SALES_REP && lead.ownerId !== this.tenantContext.memberId) {
      throw new NotFoundException('Lead not found.');
    }
    return lead;
  }

  private async findExistingOrThrow(id: string) {
    const lead = await this.tenantContext.tx.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException('Lead not found.');
    }
    return lead;
  }

  private async tryRoundRobinAssign(leadId: string) {
    const organizationId = this.tenantContext.organizationId;

    const activeReps = await this.tenantContext.tx.organizationMember.findMany({
      where: { role: OrgRole.SALES_REP, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (activeReps.length === 0) {
      return null; // nobody to assign to — the lead stays unowned.
    }

    // Ensure the cursor row exists, then lock it (FOR UPDATE) for the rest of
    // this transaction — without the lock, two concurrent lead-creation
    // requests could both read the same "last assigned" value and assign the
    // same "next" rep twice in a row (a lost-update race), which would break
    // the "actually alternates" guarantee the M3 Definition of Done tests for.
    await this.tenantContext.tx.leadRotationState.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
    const [rotationState] = await this.tenantContext.tx.$queryRaw<{ lastAssignedMemberId: string | null }[]>`
      SELECT "lastAssignedMemberId" FROM "LeadRotationState" WHERE "organizationId" = ${organizationId} FOR UPDATE
    `;

    const lastIndex = rotationState?.lastAssignedMemberId
      ? activeReps.findIndex((rep) => rep.id === rotationState.lastAssignedMemberId)
      : -1;
    const nextRep = activeReps[(lastIndex + 1) % activeReps.length];

    const [updatedLead] = await Promise.all([
      this.tenantContext.tx.lead.update({ where: { id: leadId }, data: { ownerId: nextRep.id } }),
      this.tenantContext.tx.leadRotationState.update({
        where: { organizationId },
        data: { lastAssignedMemberId: nextRep.id },
      }),
    ]);
    return updatedLead;
  }

  // Cross-tenant reference checks: these tables all have RLS, so an id from
  // a different org simply won't be found — not silently written into a
  // foreign key Postgres itself has no tenant-awareness of.
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
