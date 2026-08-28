import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';

// FR-033–FR-035. Reads across Leads/Deals through the same tenantContext.tx
// every other module uses — no raw SQL (docs/development-plan/README.md
// §M5). "Open" deal = not in a Won/Lost stage, matching the definition
// PipelineService.getMetrics() already established for pipelineValue.
@Injectable()
export class DashboardService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async getMetrics() {
    const stages = await this.tenantContext.tx.pipelineStage.findMany();
    const openStageIds = stages.filter((s) => !s.isWon && !s.isLost).map((s) => s.id);
    const wonStageIds = stages.filter((s) => s.isWon).map((s) => s.id);
    const lostStageIds = stages.filter((s) => s.isLost).map((s) => s.id);

    const [totalLeads, qualifiedLeads, openDeals, wonDeals, lostDeals, openValueSum] = await Promise.all([
      this.tenantContext.tx.lead.count(),
      this.tenantContext.tx.lead.count({ where: { status: LeadStatus.QUALIFIED } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: openStageIds } } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: wonStageIds } } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: lostStageIds } } }),
      this.tenantContext.tx.deal.aggregate({ where: { pipelineStageId: { in: openStageIds } }, _sum: { value: true } }),
    ]);

    // conversionRate: no FR/AC pins down a precise formula, so this uses the
    // most common sales-funnel meaning — share of leads that became a Won
    // deal — guarded against a zero-lead org (NFR-030 empty state).
    const conversionRate = totalLeads === 0 ? 0 : Math.round((wonDeals / totalLeads) * 1000) / 10;

    return {
      totalLeads,
      qualifiedLeads,
      openDeals,
      wonDeals,
      lostDeals,
      pipelineValue: Number(openValueSum._sum.value ?? 0),
      conversionRate,
    };
  }
}
