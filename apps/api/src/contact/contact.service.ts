import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';

// FR-019–FR-020. Every query goes through tenantContext.tx (RLS-scoped) —
// see docs/database/README.md §5.6 for why the plain PrismaService can't be
// used for tenant-scoped tables.
@Injectable()
export class ContactService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async create(dto: CreateContactDto) {
    if (dto.companyId) {
      await this.assertCompanyInTenant(dto.companyId);
    }
    return this.tenantContext.tx.contact.create({
      data: { ...dto, organizationId: this.tenantContext.organizationId },
    });
  }

  async findAll(query: ListContactsQueryDto) {
    const { page, pageSize, companyId } = query;
    const where = companyId ? { companyId } : {};
    const [data, total] = await Promise.all([
      this.tenantContext.tx.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.contact.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async findOne(id: string) {
    const contact = await this.tenantContext.tx.contact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }
    return contact;
  }

  async update(id: string, dto: UpdateContactDto) {
    await this.findOne(id);
    if (dto.companyId) {
      await this.assertCompanyInTenant(dto.companyId);
    }
    return this.tenantContext.tx.contact.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.tenantContext.tx.contact.delete({ where: { id } });
  }

  // Cross-tenant reference check: Company's own RLS means a companyId from a
  // different org simply won't be found here — not silently accepted into a
  // foreign key that Postgres itself has no tenant-awareness of.
  private async assertCompanyInTenant(companyId: string): Promise<void> {
    const company = await this.tenantContext.tx.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new BadRequestException({ code: 'INVALID_COMPANY_ID', message: 'companyId does not exist in this organization.' });
    }
  }
}
