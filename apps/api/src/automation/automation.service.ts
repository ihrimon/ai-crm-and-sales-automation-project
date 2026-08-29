import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateAutomationDto } from './dto/create-automation.dto';
import type { ListAutomationsQueryDto } from './dto/list-automations-query.dto';
import type { UpdateAutomationDto } from './dto/update-automation.dto';

// FR-042. x-roles excludes SALES_REP/VIEWER entirely (docs/api/README.md
// §4) — no row-level scoping needed beyond the tenant boundary itself.
@Injectable()
export class AutomationService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(dto: CreateAutomationDto) {
    return this.tenantContext.tx.automation.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId, createdById: this.tenantContext.memberId },
    });
  }

  async findAll(query: ListAutomationsQueryDto) {
    const { page, pageSize } = query;
    const [data, total] = await Promise.all([
      this.tenantContext.tx.automation.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.automation.count(),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    return this.findExistingOrThrow(id);
  }

  async update(id: string, dto: UpdateAutomationDto) {
    await this.findExistingOrThrow(id);
    return this.tenantContext.tx.automation.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findExistingOrThrow(id);
    await this.tenantContext.tx.automation.delete({ where: { id } });
  }

  private async findExistingOrThrow(id: string) {
    const automation = await this.tenantContext.tx.automation.findUnique({ where: { id } });
    if (!automation) {
      throw new NotFoundException('Automation not found.');
    }
    return automation;
  }
}
