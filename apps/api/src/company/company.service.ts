import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateCompanyDto } from './dto/create-company.dto';
import type { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import type { UpdateCompanyDto } from './dto/update-company.dto';

// FR-021–FR-022. Every query goes through tenantContext.tx (RLS-scoped).
@Injectable()
export class CompanyService {
  constructor(private readonly tenantContext: TenantContextService) {}

  create(dto: CreateCompanyDto) {
    return this.tenantContext.tx.company.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });
  }

  async findAll(query: ListCompaniesQueryDto) {
    const { page, pageSize } = query;
    const [data, total] = await Promise.all([
      this.tenantContext.tx.company.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.company.count(),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    const company = await this.tenantContext.tx.company.findUnique({ where: { id } });
    if (!company) {
      throw new NotFoundException('Company not found.');
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);
    return this.tenantContext.tx.company.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantContext.tx.company.delete({ where: { id } });
  }
}
