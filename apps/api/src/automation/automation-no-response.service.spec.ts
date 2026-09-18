import { AutomationNoResponseService } from './automation-no-response.service';

function buildTxMock() {
  return {
    automation: { findMany: jest.fn() },
    lead: { findMany: jest.fn() },
    automationExecution: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('AutomationNoResponseService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let prisma: { organization: { findMany: jest.Mock } };
  let actionService: { execute: jest.Mock };
  let service: AutomationNoResponseService;

  beforeEach(() => {
    tx = buildTxMock();
    prisma = { organization: { findMany: jest.fn() } };
    actionService = { execute: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = {
      runInNewTenantTransaction: jest.fn(async (_prisma: unknown, _store: unknown, fn: () => Promise<unknown>) => fn()),
      get tx() {
        return tx;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AutomationNoResponseService(prisma as any, tenantContext as any, actionService as never);
  });

  it('does nothing for an organization with no active NO_RESPONSE automations', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    tx.automation.findMany.mockResolvedValue([]);

    await service.sweep();

    expect(tx.lead.findMany).not.toHaveBeenCalled();
    expect(actionService.execute).not.toHaveBeenCalled();
  });

  it('fires the action for a lead whose daysSinceContact matches the condition', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    const automation = { id: 'automation-1', conditionJson: { field: 'daysSinceContact', operator: 'gte', value: 3 } };
    tx.automation.findMany.mockResolvedValue([automation]);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1', ownerId: 'member-1', status: 'CONTACTED', source: 'Webinar', industry: null, lastContactedAt: fourDaysAgo }]);
    tx.automationExecution.findMany.mockResolvedValue([]);

    await service.sweep();

    expect(actionService.execute).toHaveBeenCalledWith(
      automation,
      expect.objectContaining({ leadId: 'lead-1', ownerId: 'member-1', fields: expect.objectContaining({ daysSinceContact: 4 }) }),
    );
  });

  it('does not re-fire for a (automation, lead) pair that already has an execution', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    const automation = { id: 'automation-1', conditionJson: null };
    tx.automation.findMany.mockResolvedValue([automation]);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    tx.lead.findMany.mockResolvedValue([{ id: 'lead-1', ownerId: 'member-1', status: 'CONTACTED', source: null, industry: null, lastContactedAt: fourDaysAgo }]);
    tx.automationExecution.findMany.mockResolvedValue([{ automationId: 'automation-1', leadId: 'lead-1' }]);

    await service.sweep();

    expect(actionService.execute).not.toHaveBeenCalled();
  });

  it('checks (automation, lead) dedup with exactly one batched query, not one per pair (Phase 17 N+1 fix)', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-1' }]);
    const automations = [
      { id: 'automation-1', conditionJson: null },
      { id: 'automation-2', conditionJson: null },
    ];
    tx.automation.findMany.mockResolvedValue(automations);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    tx.lead.findMany.mockResolvedValue([
      { id: 'lead-1', ownerId: 'member-1', status: 'CONTACTED', source: null, industry: null, lastContactedAt: fourDaysAgo },
      { id: 'lead-2', ownerId: 'member-1', status: 'CONTACTED', source: null, industry: null, lastContactedAt: fourDaysAgo },
    ]);
    tx.automationExecution.findMany.mockResolvedValue([{ automationId: 'automation-1', leadId: 'lead-1' }]);

    await service.sweep();

    // 2 leads x 2 automations = 4 pairs to check, but exactly one query.
    expect(tx.automationExecution.findMany).toHaveBeenCalledTimes(1);
    expect(tx.automationExecution.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { automationId: { in: ['automation-1', 'automation-2'] }, leadId: { in: ['lead-1', 'lead-2'] } },
      }),
    );
    // 4 pairs minus the 1 already-handled (automation-1, lead-1) = 3 fires.
    expect(actionService.execute).toHaveBeenCalledTimes(3);
  });

  it('a sweep failure for one organization does not stop the others', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org-broken' }, { id: 'org-fine' }]);
    tx.automation.findMany.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce([]);

    await expect(service.sweep()).resolves.toBeUndefined();
    expect(tx.automation.findMany).toHaveBeenCalledTimes(2);
  });
});
