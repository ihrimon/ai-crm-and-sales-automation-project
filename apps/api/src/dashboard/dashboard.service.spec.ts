import { DashboardService } from './dashboard.service';

function buildTxMock() {
  return {
    pipelineStage: { findMany: jest.fn() },
    lead: { count: jest.fn() },
    deal: { count: jest.fn(), aggregate: jest.fn() },
  };
}

describe('DashboardService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;

  function buildService() {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new DashboardService(tenantContext as any);
  }

  it('returns a zeroed-out, non-crashing shape for an organization with zero leads/deals (NFR-030 empty state)', async () => {
    const service = buildService();
    tx.pipelineStage.findMany.mockResolvedValue([]);
    tx.lead.count.mockResolvedValue(0);
    tx.deal.count.mockResolvedValue(0);
    tx.deal.aggregate.mockResolvedValue({ _sum: { value: null } });

    const metrics = await service.getMetrics();

    expect(metrics).toEqual({
      totalLeads: 0,
      qualifiedLeads: 0,
      openDeals: 0,
      wonDeals: 0,
      lostDeals: 0,
      pipelineValue: 0,
      conversionRate: 0,
    });
  });

  it('splits deals by stage into open/won/lost using the stage flags, and sums only open-stage value', async () => {
    const service = buildService();
    tx.pipelineStage.findMany.mockResolvedValue([
      { id: 'stage-open', isWon: false, isLost: false },
      { id: 'stage-won', isWon: true, isLost: false },
      { id: 'stage-lost', isWon: false, isLost: true },
    ]);
    tx.lead.count.mockResolvedValueOnce(10).mockResolvedValueOnce(4);
    tx.deal.count.mockResolvedValueOnce(3).mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    tx.deal.aggregate.mockResolvedValue({ _sum: { value: 5000 } });

    const metrics = await service.getMetrics();

    expect(tx.deal.count).toHaveBeenNthCalledWith(1, { where: { pipelineStageId: { in: ['stage-open'] } } });
    expect(tx.deal.count).toHaveBeenNthCalledWith(2, { where: { pipelineStageId: { in: ['stage-won'] } } });
    expect(tx.deal.count).toHaveBeenNthCalledWith(3, { where: { pipelineStageId: { in: ['stage-lost'] } } });
    expect(metrics).toMatchObject({
      totalLeads: 10,
      qualifiedLeads: 4,
      openDeals: 3,
      wonDeals: 2,
      lostDeals: 1,
      pipelineValue: 5000,
      conversionRate: 20, // 2 won / 10 leads
    });
  });
});
