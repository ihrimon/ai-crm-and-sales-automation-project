import { Injectable, Logger } from '@nestjs/common';
import type { AutomationTriggerType } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { AutomationActionService } from './automation-action.service';
import { matchesCondition } from './automation-condition.util';
import type { AutomationEventContext } from './automation-event-context';

// FR-043, UC-011. The engine's entry point — LeadService/DealService (and
// the NO_RESPONSE sweep) call this after their own write succeeds, inside
// the SAME tenant-scoped transaction (tenantContext.tx), so an
// AutomationExecution row and the event that caused it commit atomically.
//
// Deliberately never throws: a broken automation must never break the Lead/
// Deal operation that triggered it. Each call site still wraps this in its
// own try/catch as a second line of defense — see LeadService.create()/
// DealService.update() for why that redundancy is worth it here specifically.
@Injectable()
export class AutomationTriggerService {
  private readonly logger = new Logger(AutomationTriggerService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly actionService: AutomationActionService,
  ) {}

  async evaluateAndExecute(triggerType: AutomationTriggerType, context: AutomationEventContext): Promise<void> {
    const automations = await this.tenantContext.tx.automation.findMany({
      where: { triggerType, isActive: true },
    });

    for (const automation of automations) {
      try {
        if (!matchesCondition(automation.conditionJson, context.fields)) continue;
        await this.actionService.execute(automation, context);
      } catch (err) {
        // AutomationActionService already catches its own action-execution
        // failures and logs a FAILED row — reaching here means something
        // broke before/around that (e.g. a bad conditionJson shape slipping
        // past create-time validation). Log and move on to the next
        // automation rather than losing the rest of the batch.
        this.logger.error(
          `Failed to evaluate automation "${automation.name}" (${automation.id}) for trigger ${triggerType}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
