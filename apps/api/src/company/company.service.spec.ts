import { NotFoundException } from '@nestjs/common';
import { CompanyService } from './company.service';

function buildTxMock() {
  return {
    company: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  };
}

describe('CompanyService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let service: CompanyService;

  beforeEach(() => {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new CompanyService(tenantContext as any);
  });

  it('creates a company scoped to the organization', async () => {
    tx.company.create.mockResolvedValue({ id: 'company-1' });

    await service.create({ name: 'Acme' });

    expect(tx.company.create).toHaveBeenCalledWith({ data: { name: 'Acme', organizationId: 'org-1' } });
  });

  it('findOne throws NotFound for a company RLS makes invisible (a different org)', async () => {
    tx.company.findUnique.mockResolvedValue(null);

    await expect(service.findOne('someone-elses-company')).rejects.toThrow(NotFoundException);
  });

  it('update 404s for an unknown company without writing', async () => {
    tx.company.findUnique.mockResolvedValue(null);

    await expect(service.update('ghost', { name: 'New name' })).rejects.toThrow(NotFoundException);
    expect(tx.company.update).not.toHaveBeenCalled();
  });

  it('remove 404s for an unknown company', async () => {
    tx.company.findUnique.mockResolvedValue(null);

    await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    expect(tx.company.delete).not.toHaveBeenCalled();
  });
});
