import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactService } from './contact.service';

function buildTxMock() {
  return {
    contact: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    company: { findUnique: jest.fn() },
  };
}

describe('ContactService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let service: ContactService;

  beforeEach(() => {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ContactService(tenantContext as any);
  });

  it('rejects an unknown companyId on create', async () => {
    tx.company.findUnique.mockResolvedValue(null);

    await expect(service.create({ name: 'Jane', companyId: 'ghost-company' })).rejects.toThrow(BadRequestException);
    expect(tx.contact.create).not.toHaveBeenCalled();
  });

  it('creates a contact scoped to the organization', async () => {
    tx.contact.create.mockResolvedValue({ id: 'contact-1' });

    await service.create({ name: 'Jane' });

    expect(tx.contact.create).toHaveBeenCalledWith({ data: { name: 'Jane', organizationId: 'org-1' } });
  });

  it('findOne throws NotFound for a contact RLS makes invisible (a different org)', async () => {
    tx.contact.findUnique.mockResolvedValue(null);

    await expect(service.findOne('someone-elses-contact')).rejects.toThrow(NotFoundException);
  });

  it('update rejects an unknown companyId without touching the contact', async () => {
    tx.contact.findUnique.mockResolvedValue({ id: 'contact-1' });
    tx.company.findUnique.mockResolvedValue(null);

    await expect(service.update('contact-1', { companyId: 'ghost-company' })).rejects.toThrow(BadRequestException);
    expect(tx.contact.update).not.toHaveBeenCalled();
  });

  it('remove 404s for an unknown contact', async () => {
    tx.contact.findUnique.mockResolvedValue(null);

    await expect(service.remove('ghost')).rejects.toThrow(NotFoundException);
    expect(tx.contact.delete).not.toHaveBeenCalled();
  });
});
