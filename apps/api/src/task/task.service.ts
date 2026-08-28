import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, type Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

const MANAGER_ROLES: OrgRole[] = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER];

// FR-031–FR-032. Every query goes through tenantContext.tx (RLS-scoped) —
// see docs/database/README.md §5.6.
@Injectable()
export class TaskService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(dto: CreateTaskDto) {
    this.assertExactlyOneRelation(dto);
    if (dto.leadId) await this.assertLeadInTenant(dto.leadId);
    if (dto.contactId) await this.assertContactInTenant(dto.contactId);
    if (dto.companyId) await this.assertCompanyInTenant(dto.companyId);
    if (dto.dealId) await this.assertDealInTenant(dto.dealId);
    if (dto.assignedToId) await this.assertActiveMemberInTenant(dto.assignedToId);

    return this.tenantContext.tx.task.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });
  }

  // docs/ui-ux/README.md §3: Tasks list is visible to all roles (no
  // ownership row-scope on read, unlike Lead/Deal) — only the write side
  // (update()) is restricted to the assignee or a manager-tier role.
  async findAll(query: ListTasksQueryDto) {
    const { page, pageSize, assignedToId, status, leadId, contactId, companyId, dealId } = query;
    const where: Prisma.TaskWhereInput = {};
    if (assignedToId) where.assignedToId = assignedToId;
    if (status) where.status = status;
    if (leadId) where.leadId = leadId;
    if (contactId) where.contactId = contactId;
    if (companyId) where.companyId = companyId;
    if (dealId) where.dealId = dealId;

    const [data, total] = await Promise.all([
      this.tenantContext.tx.task.findMany({
        where,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.task.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  // docs/ui-ux/README.md §3 "Tasks" row: "write limited to assignee +
  // OWNER/ADMIN/SALES_MANAGER" — a SALES_REP who isn't the assignee is
  // rejected with 403, not 404 (the task is already visible to them via the
  // unscoped list, so there's no existence to hide).
  async update(id: string, dto: UpdateTaskDto) {
    const task = await this.findExistingOrThrow(id);
    const isAssignee = task.assignedToId === this.tenantContext.memberId;
    const isManager = MANAGER_ROLES.includes(this.tenantContext.role);
    if (!isAssignee && !isManager) {
      throw new ForbiddenException('Only the assignee or a manager-tier role can update this task.');
    }
    return this.tenantContext.tx.task.update({ where: { id }, data: dto });
  }

  private async findExistingOrThrow(id: string) {
    const task = await this.tenantContext.tx.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException('Task not found.');
    }
    return task;
  }

  // database/README.md §5.2: four nullable per-type FKs instead of a
  // polymorphic (entityType, entityId) pair, with this check replacing what
  // a single required column would have enforced for free.
  private assertExactlyOneRelation(dto: CreateTaskDto): void {
    const relationCount = [dto.leadId, dto.contactId, dto.companyId, dto.dealId].filter(Boolean).length;
    if (relationCount !== 1) {
      throw new BadRequestException({
        code: 'INVALID_TASK_RELATION',
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

  private async assertActiveMemberInTenant(memberId: string): Promise<void> {
    const member = await this.tenantContext.tx.organizationMember.findUnique({ where: { id: memberId } });
    if (!member || !member.isActive) {
      throw new BadRequestException({
        code: 'INVALID_ASSIGNED_TO_ID',
        message: 'assignedToId does not refer to an active member of this organization.',
      });
    }
  }
}
