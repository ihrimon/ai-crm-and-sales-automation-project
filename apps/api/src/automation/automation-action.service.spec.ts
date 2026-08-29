import { AutomationActionType, AutomationExecutionStatus, AutomationTriggeredByType } from '@prisma/client';
import { AutomationActionService } from './automation-action.service';

function buildTxMock() {
  return {
    automationExecution: { create: jest.fn() },
    task: { create: jest.fn() },
  };
}

const AUTOMATION = { id: 'automation-1', name: 'My Automation', actionType: AutomationActionType.CREATE_TASK as AutomationActionType };

describe('AutomationActionService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let notificationService: { create: jest.Mock };
  let service: AutomationActionService;

  beforeEach(() => {
    tx = buildTxMock();
    notificationService = { create: jest.fn() };
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AutomationActionService(tenantContext as any, notificationService as never);
  });

  describe('CALL_AI — never executes here, only logs PENDING_APPROVAL (FR-052 🔎)', () => {
    it('creates a PENDING_APPROVAL, triggeredByType=AI row and does nothing else', async () => {
      const automation = { ...AUTOMATION, actionType: AutomationActionType.CALL_AI };
      await service.execute(automation as never, { leadId: 'lead-1', ownerId: 'member-2', fields: {} });

      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          automationId: 'automation-1',
          leadId: 'lead-1',
          dealId: null,
          triggeredByType: AutomationTriggeredByType.AI,
          status: AutomationExecutionStatus.PENDING_APPROVAL,
        },
      });
      expect(tx.task.create).not.toHaveBeenCalled();
      expect(notificationService.create).not.toHaveBeenCalled();
    });
  });

  describe('CREATE_TASK — a plain rule action, executes immediately', () => {
    it('creates a Task assigned to the lead/deal owner and logs EXECUTED', async () => {
      tx.task.create.mockResolvedValue({ id: 'task-1' });

      await service.execute(AUTOMATION as never, { leadId: 'lead-1', ownerId: 'member-2', fields: {} });

      expect(tx.task.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', leadId: 'lead-1', dealId: null, assignedToId: 'member-2', title: 'My Automation' },
      });
      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          triggeredByType: AutomationTriggeredByType.RULE,
          status: AutomationExecutionStatus.EXECUTED,
          resultJson: { taskId: 'task-1' },
        }),
      });
    });

    it('logs FAILED (not a thrown error) when the underlying create fails', async () => {
      tx.task.create.mockRejectedValue(new Error('db exploded'));

      await service.execute(AUTOMATION as never, { leadId: 'lead-1', ownerId: 'member-2', fields: {} });

      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: AutomationExecutionStatus.FAILED, error: expect.any(String) }),
      });
    });
  });

  describe('NOTIFY', () => {
    it('creates a Notification for the owner via NotificationService (M8)', async () => {
      notificationService.create.mockResolvedValue({ id: 'notif-1' });
      const automation = { ...AUTOMATION, actionType: AutomationActionType.NOTIFY };

      await service.execute(automation as never, { leadId: 'lead-1', ownerId: 'member-2', fields: {} });

      expect(notificationService.create).toHaveBeenCalledWith({
        recipientMemberId: 'member-2',
        type: 'AUTOMATION',
        payload: { automationId: 'automation-1', automationName: 'My Automation' },
      });
    });

    it('skips (does not throw) when there is no owner to notify', async () => {
      const automation = { ...AUTOMATION, actionType: AutomationActionType.NOTIFY };

      await service.execute(automation as never, { leadId: 'lead-1', ownerId: null, fields: {} });

      expect(notificationService.create).not.toHaveBeenCalled();
      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: AutomationExecutionStatus.EXECUTED, resultJson: { skipped: true, reason: expect.any(String) } }),
      });
    });
  });

  describe('an unsupported rule action type (ASSIGN_LEAD_ROUND_ROBIN/WEBHOOK — deliberately unhandled here)', () => {
    it('logs FAILED rather than throwing back to the caller', async () => {
      const automation = { ...AUTOMATION, actionType: AutomationActionType.WEBHOOK };

      await expect(service.execute(automation as never, { leadId: 'lead-1', ownerId: null, fields: {} })).resolves.toBeUndefined();

      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: AutomationExecutionStatus.FAILED }),
      });
    });
  });

  describe('SEND_EMAIL', () => {
    it('logs to console (no email provider exists) and records EXECUTED', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
      const automation = { ...AUTOMATION, actionType: AutomationActionType.SEND_EMAIL };

      await service.execute(automation as never, { leadId: 'lead-1', ownerId: 'member-2', fields: {} });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[dev-only]'), expect.anything());
      expect(tx.automationExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: AutomationExecutionStatus.EXECUTED, resultJson: { logged: true } }),
      });
      consoleSpy.mockRestore();
    });
  });
});
