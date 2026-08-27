import { NotFoundException } from '@nestjs/common';
import { PipelineService } from './pipeline.service';

function buildTxMock() {
  return {
    pipeline: { findUnique: jest.fn(), findMany: jest.fn() },
    pipelineStage: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    deal: { aggregate: jest.fn(), groupBy: jest.fn() },
  };
}

describe('PipelineService', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tx: any;
  let service: PipelineService;

  beforeEach(() => {
    tx = buildTxMock();
    const tenantContext = { tx, organizationId: 'org-1', userId: 'user-1', memberId: 'member-1', role: 'OWNER' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new PipelineService(tenantContext as any);
  });

  it('404s listStages/createStage/updateStage for a pipeline RLS makes invisible (a different org)', async () => {
    tx.pipeline.findUnique.mockResolvedValue(null);

    await expect(service.listStages('ghost-pipeline')).rejects.toThrow(NotFoundException);
    await expect(service.createStage('ghost-pipeline', { name: 'New', order: 1 })).rejects.toThrow(NotFoundException);
    await expect(service.updateStage('ghost-pipeline', 'stage-1', { name: 'X' })).rejects.toThrow(NotFoundException);
  });

  it('404s updateStage when the stage belongs to a different pipeline', async () => {
    tx.pipeline.findUnique.mockResolvedValue({ id: 'pipeline-1' });
    tx.pipelineStage.findUnique.mockResolvedValue({ id: 'stage-1', pipelineId: 'other-pipeline' });

    await expect(service.updateStage('pipeline-1', 'stage-1', { name: 'X' })).rejects.toThrow(NotFoundException);
    expect(tx.pipelineStage.update).not.toHaveBeenCalled();
  });

  it('creates a stage under the given pipeline', async () => {
    tx.pipeline.findUnique.mockResolvedValue({ id: 'pipeline-1' });
    tx.pipelineStage.create.mockResolvedValue({ id: 'stage-new' });

    await service.createStage('pipeline-1', { name: 'Demo', order: 8 });

    expect(tx.pipelineStage.create).toHaveBeenCalledWith({
      data: { pipelineId: 'pipeline-1', name: 'Demo', order: 8, isWon: false, isLost: false },
    });
  });

  it('computes metrics: totalValue excludes Won/Lost stages, countByStage includes every stage', async () => {
    tx.pipeline.findUnique.mockResolvedValue({ id: 'pipeline-1' });
    tx.pipelineStage.findMany.mockResolvedValue([
      { id: 'stage-open-1', isWon: false, isLost: false },
      { id: 'stage-open-2', isWon: false, isLost: false },
      { id: 'stage-won', isWon: true, isLost: false },
      { id: 'stage-lost', isWon: false, isLost: true },
    ]);
    tx.deal.aggregate.mockResolvedValue({ _sum: { value: 15000 } });
    tx.deal.groupBy.mockResolvedValue([
      { pipelineStageId: 'stage-open-1', _count: { _all: 2 } },
      { pipelineStageId: 'stage-won', _count: { _all: 3 } },
    ]);

    const result = await service.getMetrics('pipeline-1');

    expect(tx.deal.aggregate).toHaveBeenCalledWith({
      where: { pipelineStageId: { in: ['stage-open-1', 'stage-open-2'] } },
      _sum: { value: true },
    });
    expect(result).toEqual({
      totalValue: 15000,
      countByStage: {
        'stage-open-1': 2,
        'stage-open-2': 0,
        'stage-won': 3,
        'stage-lost': 0,
      },
    });
  });
});
