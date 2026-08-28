import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateActivityDto } from './dto/create-activity.dto';
import type { ListActivitiesQueryDto } from './dto/list-activities-query.dto';

// FR-030. Every query goes through tenantContext.tx (RLS-scoped) — see
// docs/database/README.md §5.6. No update/delete endpoint exists
// (docs/api/openapi.yaml) — an activity is an immutable log entry.
@Injectable()
export class ActivityService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(dto: CreateActivityDto) {
    this.assertExactlyOneRelation(dto);
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.dealId) await this.assertDealInTenant(dto.dealId);

    return this.tenantContext.tx.activity.create({
      data: {
        ...dto,
        organizationId: this.tenantContext.organizationId,
        createdById: this.tenantContext.memberId,
      },
    });
  }

  async findAll(query: ListActivitiesQueryDto) {
    const { page, pageSize, leadId, contactId, companyId, dealId } = query;
    const where: Prisma.ActivityWhereInput = {};
    if (leadId) where.leadId = leadId;
    if (contactId) where.contactId = contactId;
    if (companyId) where.companyId = companyId;
    if (dealId) where.dealId = dealId;

    const [data, total] = await Promise.all([
      this.tenantContext.tx.activity.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.activity.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  // database/README.md §5.2: four nullable per-type FKs instead of a
  // polymorphic (entityType, entityId) pair, with this check replacing what
  // a single required column would have enforced for free.
  private assertExactlyOneRelation(dto: CreateActivityDto): void {
    const relationCount = [dto.leadId, dto.contactId, dto.companyId, dto.dealId].filter(Boolean).length;
    if (relationCount !== 1) {
      throw new BadRequestException({
        code: 'INVALID_ACTIVITY_RELATION',
        message: 'Exactly one of leadId, contactId, companyId, or dealId must be set.',
      });
    }
  }

  // Cross-tenant reference checks: these tables all have RLS, so an id from
  // a different org simply won't be found — not silently written into a
  // foreign key Postgres itself has no tenant-awareness of.
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

  private async assertDealInTenant(dealId: string): Promise<void> {
    const deal = await this.tenantContext.tx.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new BadRequestException({ code: 'INVALID_DEAL_ID', message: 'dealId does not exist in this organization.' });
    }
  }
}
