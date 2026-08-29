import { Injectable, Logger } from '@nestjs/common';
import { Automation, AutomationActionType, AutomationExecutionStatus, AutomationTriggeredByType } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { NotificationService } from '../notification/notification.service';
import type { AutomationEventContext } from './automation-event-context';

// FR-044–FR-045. Every path here ends in exactly one AutomationExecution row
// (docs/database/README.md §5.4) — success, failure, or (for CALL_AI)
// pending approval. Never throws back to the caller (AutomationTriggerService
// already treats this as best-effort, but each branch here is also
// individually defensive so one bad action doesn't corrupt another's log
// entry).
@Injectable()
export class AutomationActionService {
  private readonly logger = new Logger(AutomationActionService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly notificationService: NotificationService,
  ) {}

  // architecture/README.md §6.3: CALL_AI is the one actionType that's
  // "AI-derived" (FR-052 🔎) — it never executes here, only ever logs a
  // PENDING_APPROVAL row. Every other actionType is a "plain rule action"
  // and executes immediately. See docs/development-plan/README.md §M7 for
  // why this binary (actionType === CALL_AI) is the approval trigger, not
  // something derived from the condition or trigger type.
  async execute(automation: Automation, context: AutomationEventContext): Promise<void> {
    if (automation.actionType === AutomationActionType.CALL_AI) {
      await this.tenantContext.tx.automationExecution.create({
        data: {
          organizationId: this.tenantContext.organizationId,
          automationId: automation.id,
          leadId: context.leadId ?? null,
          dealId: context.dealId ?? null,
          triggeredByType: AutomationTriggeredByType.AI,
          status: AutomationExecutionStatus.PENDING_APPROVAL,
        },
      });
      return;
    }

    try {
      const resultJson = await this.runRuleAction(automation, context);
      await this.tenantContext.tx.automationExecution.create({
        data: {
          organizationId: this.tenantContext.organizationId,
          automationId: automation.id,
          leadId: context.leadId ?? null,
          dealId: context.dealId ?? null,
          triggeredByType: AutomationTriggeredByType.RULE,
          status: AutomationExecutionStatus.EXECUTED,
          resultJson: resultJson as object,
        },
      });
    } catch (err) {
      this.logger.error(`Automation "${automation.name}" (${automation.id}) action failed`, err instanceof Error ? err.stack : String(err));
      await this.tenantContext.tx.automationExecution.create({
        data: {
          organizationId: this.tenantContext.organizationId,
          automationId: automation.id,
          leadId: context.leadId ?? null,
          dealId: context.dealId ?? null,
          triggeredByType: AutomationTriggeredByType.RULE,
          status: AutomationExecutionStatus.FAILED,
          error: 'Could not execute this automation action.',
        },
      });
    }
  }

  private async runRuleAction(automation: Automation, context: AutomationEventContext): Promise<Record<string, unknown>> {
    switch (automation.actionType) {
      case AutomationActionType.CREATE_TASK: {
        const task = await this.tenantContext.tx.task.create({
          data: {
            organizationId: this.tenantContext.organizationId,
            leadId: context.leadId ?? null,
            dealId: context.dealId ?? null,
            assignedToId: context.ownerId ?? null,
            title: automation.name,
          },
        });
        return { taskId: task.id };
      }

      case AutomationActionType.NOTIFY: {
        if (!context.ownerId) {
          return { skipped: true, reason: 'No recipient — the lead/deal has no owner.' };
        }
        // M8 — routed through NotificationService.create() now that it
        // exists, instead of a direct tenantContext.tx.notification.create()
        // call, so there's one write path for notifications, not two.
        const notification = await this.notificationService.create({
          recipientMemberId: context.ownerId,
          type: 'AUTOMATION',
          payload: { automationId: automation.id, automationName: automation.name },
        });
        return { notificationId: notification.id };
      }

      case AutomationActionType.SEND_EMAIL: {
        // No email-sending infrastructure exists anywhere in this project
        // yet (M1) — same dev-only console log AuthService.logDevLink() uses
        // for password-reset/verification links, not a new send path.
        // eslint-disable-next-line no-console
        console.log(`[dev-only] Automation "${automation.name}" would send an email`, {
          leadId: context.leadId,
          dealId: context.dealId,
        });
        return { logged: true };
      }

      default:
        // ASSIGN_LEAD_ROUND_ROBIN stays inline in LeadService (M3's decision,
        // docs/development-plan/README.md §4.1d) and WEBHOOK is out of scope
        // (deferred, SUMMARY.md §4) — both remain valid enum values with no
        // handler here, deliberately.
        throw new Error(`Unsupported rule action type: ${automation.actionType}`);
    }
  }
}
