import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';

// FR-033–FR-035. Reads across Leads/Deals through the same tenantContext.tx
// every other module uses — no raw SQL (docs/development-plan/README.md
// §M5). "Open" deal = not in a Won/Lost stage, matching the definition
// PipelineService.getMetrics() already established for pipelineValue.
const TREND_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DashboardService {
  constructor(private readonly tenantContext: TenantContextService) {}

  async getMetrics() {
    const stages = await this.tenantContext.tx.pipelineStage.findMany();
    const openStageIds = stages.filter((s) => !s.isWon && !s.isLost).map((s) => s.id);
    const wonStageIds = stages.filter((s) => s.isWon).map((s) => s.id);
    const lostStageIds = stages.filter((s) => s.isLost).map((s) => s.id);

    const trendStart = new Date(Date.now() - (TREND_DAYS - 1) * MS_PER_DAY);
    trendStart.setUTCHours(0, 0, 0, 0);

    const [totalLeads, qualifiedLeads, openDeals, wonDeals, lostDeals, openValueSum, trendRows] = await Promise.all([
      this.tenantContext.tx.lead.count(),
      this.tenantContext.tx.lead.count({ where: { status: LeadStatus.QUALIFIED } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: openStageIds } } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: wonStageIds } } }),
      this.tenantContext.tx.deal.count({ where: { pipelineStageId: { in: lostStageIds } } }),
      this.tenantContext.tx.deal.aggregate({ where: { pipelineStageId: { in: openStageIds } }, _sum: { value: true } }),
      // Grouped DB-side (RLS still applies — same tx) rather than pulling
      // every recent lead row just to bucket createdAt in JavaScript.
      this.tenantContext.tx.$queryRaw<{ day: Date; count: number }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::int AS count
        FROM "Lead"
        WHERE "createdAt" >= ${trendStart}
        GROUP BY 1
      `,
    ]);

    // Days with no new leads have no row in the GROUP BY result — fill them
    // with 0 so the chart's x-axis is a full, evenly spaced window.
    const countsByDay = new Map(trendRows.map((row) => [row.day.toISOString().slice(0, 10), row.count]));
    const leadsTrend = Array.from({ length: TREND_DAYS }, (_, index) => {
      const date = new Date(trendStart.getTime() + index * MS_PER_DAY).toISOString().slice(0, 10);
      return { date, leads: countsByDay.get(date) ?? 0 };
    });

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
      leadsTrend,
    };
  }
}
