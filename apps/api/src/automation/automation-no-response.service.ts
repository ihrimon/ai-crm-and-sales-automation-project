import { Injectable, Logger } from '@nestjs/common';
import { AutomationTriggerType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { AutomationActionService } from './automation-action.service';
import { matchesCondition } from './automation-condition.util';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// FR-043's NO_RESPONSE trigger is time-based ("Lead Contacted, no response
// for X days" — guideline/05-automation.md Example 4), not tied to a single
// write the way LEAD_CREATED/DEAL_STAGE_CHANGED/DEAL_WON are — so it can't
// hook into an existing service call. Instead a periodic sweep
// (automation-no-response.processor.ts schedules this on a BullMQ repeat)
// scans every organization's CONTACTED leads for a match.
//
// This class holds the sweep logic on its own (not inline in the processor)
// specifically so it's directly callable/testable without waiting on
// BullMQ's real repeat scheduler — see automation-no-response.service.spec.ts.
@Injectable()
export class AutomationNoResponseService {
  private readonly logger = new Logger(AutomationNoResponseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly actionService: AutomationActionService,
  ) {}

  async sweep(): Promise<void> {
    // Organization itself carries no RLS policy (it's the tenant root, not a
    // tenant-scoped table — docs/database/rls-policies.sql) so a plain
    // PrismaService query is fine here; every per-org query below still goes
    // through tenantContext.tx via runInNewTenantTransaction.
    const organizations = await this.prisma.organization.findMany({ select: { id: true } });
    for (const { id: organizationId } of organizations) {
      try {
        await this.sweepOrganization(organizationId);
      } catch (err) {
        this.logger.error(`NO_RESPONSE sweep failed for organization ${organizationId}`, err instanceof Error ? err.stack : String(err));
      }
    }
  }

  private async sweepOrganization(organizationId: string): Promise<void> {
    await this.tenantContext.runInNewTenantTransaction(
      this.prisma,
      // No real user initiated this — role/memberId are placeholders unused
      // by anything on this path (CREATE_TASK/NOTIFY use the lead's own
      // ownerId, not the acting member).
      { organizationId, userId: 'system', role: 'OWNER' as never, memberId: 'system' },
      async () => {
        const automations = await this.tenantContext.tx.automation.findMany({
          where: { triggerType: AutomationTriggerType.NO_RESPONSE, isActive: true },
        });
        if (automations.length === 0) return;

        const leads = await this.tenantContext.tx.lead.findMany({
          where: { status: 'CONTACTED', lastContactedAt: { not: null } },
        });

        for (const lead of leads) {
          const daysSinceContact = Math.floor((Date.now() - lead.lastContactedAt!.getTime()) / MS_PER_DAY);
          const fields: Record<string, unknown> = {
            daysSinceContact,
            status: lead.status,
            source: lead.source,
            industry: lead.industry,
          };

          for (const automation of automations) {
            if (!matchesCondition(automation.conditionJson, fields)) continue;

            // Fire at most once per (automation, lead) pair — without this,
            // every sweep interval would re-fire the same automation on the
            // same still-unresponsive lead forever.
            const alreadyHandled = await this.tenantContext.tx.automationExecution.findFirst({
              where: { automationId: automation.id, leadId: lead.id },
            });
            if (alreadyHandled) continue;

            await this.actionService.execute(automation, { leadId: lead.id, ownerId: lead.ownerId, fields });
          }
        }
      },
    );
  }
}
