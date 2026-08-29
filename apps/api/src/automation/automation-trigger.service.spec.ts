import { AutomationTriggerType } from '@prisma/client';
import { AutomationTriggerService } from './automation-trigger.service';

function buildTxMock() {
  return {
    automation: { findMany: jest.fn() },
  };
}

describe('AutomationTriggerService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let actionService: { execute: jest.Mock };
  let service: AutomationTriggerService;

  beforeEach(() => {
    tx = buildTxMock();
    actionService = { execute: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AutomationTriggerService(tenantContext as any, actionService as never);
  });

  it('only looks up active automations for the given trigger type', async () => {
    tx.automation.findMany.mockResolvedValue([]);
    await service.evaluateAndExecute(AutomationTriggerType.LEAD_CREATED, { leadId: 'lead-1', fields: {} });
    expect(tx.automation.findMany).toHaveBeenCalledWith({
      where: { triggerType: AutomationTriggerType.LEAD_CREATED, isActive: true },
    });
  });

  it('executes only automations whose condition matches the context', async () => {
    tx.automation.findMany.mockResolvedValue([
      { id: 'a-match', conditionJson: { field: 'score', operator: 'gt', value: 80 } },
      { id: 'a-no-match', conditionJson: { field: 'score', operator: 'gt', value: 999 } },
      { id: 'a-no-condition', conditionJson: null },
    ]);

    await service.evaluateAndExecute(AutomationTriggerType.LEAD_CREATED, { leadId: 'lead-1', fields: { score: 90 } });

    expect(actionService.execute).toHaveBeenCalledTimes(2);
    const executedIds = actionService.execute.mock.calls.map((call) => call[0].id);
    expect(executedIds).toEqual(['a-match', 'a-no-condition']);
  });

  it('a broken automation (action service throws) does not stop the rest from evaluating', async () => {
    tx.automation.findMany.mockResolvedValue([{ id: 'a-broken', conditionJson: null }, { id: 'a-fine', conditionJson: null }]);
    actionService.execute.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(undefined);

    await expect(service.evaluateAndExecute(AutomationTriggerType.LEAD_CREATED, { leadId: 'lead-1', fields: {} })).resolves.toBeUndefined();

    expect(actionService.execute).toHaveBeenCalledTimes(2);
  });
});
