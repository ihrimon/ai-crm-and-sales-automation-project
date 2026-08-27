import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, type Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateDealDto } from './dto/create-deal.dto';
import type { ListDealsQueryDto } from './dto/list-deals-query.dto';
import type { MoveDealDto } from './dto/move-deal.dto';
import type { UpdateDealDto } from './dto/update-deal.dto';

// FR-023–FR-026, FR-028. Every query goes through tenantContext.tx
// (RLS-scoped) — see docs/database/README.md §5.6.
@Injectable()
export class DealService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(dto: CreateDealDto) {
    await this.assertStageInTenant(dto.pipelineStageId);
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);

    return this.tenantContext.tx.deal.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });
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
    await this.findOwnershipScoped(id);
    if (dto.pipelineStageId) {
      const stage = await this.assertStageInTenant(dto.pipelineStageId);
      this.assertLostReasonProvided(stage, dto.lostReason);
    }
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.ownerId) await this.assertActiveMemberInTenant(dto.ownerId);
    return this.tenantContext.tx.deal.update({ where: { id }, data: dto });
  }

  // FR-025, FR-028: "move" is the sanctioned way a deal changes pipeline
  // stage. AC (docs/development-plan/README.md §M4): moving into an isLost
  // stage without a lostReason is rejected server-side, not just discouraged
  // by the UI prompt (docs/ui-ux/README.md §5.4).
  async move(id: string, dto: MoveDealDto) {
    await this.findOwnershipScoped(id);
    const stage = await this.assertStageInTenant(dto.pipelineStageId);
    this.assertLostReasonProvided(stage, dto.lostReason);

    return this.tenantContext.tx.deal.update({
      where: { id },
      data: { pipelineStageId: dto.pipelineStageId, lostReason: dto.lostReason },
    });
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
