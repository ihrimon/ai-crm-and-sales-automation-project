import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import type { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';

// FR-027–FR-029. `Pipeline` itself has no POST endpoint (docs/api/openapi.yaml)
// — one is auto-seeded per organization at creation time
// (OrganizationService.create()); only its stages are configurable here.
@Injectable()
export class PipelineService {
  constructor(private readonly tenantContext: TenantContextService) {}

  findAllPipelines() {
    return this.tenantContext.tx.pipeline.findMany({ orderBy: { name: 'asc' } });
  }

  async listStages(pipelineId: string) {
    await this.findPipelineOrThrow(pipelineId);
    return this.tenantContext.tx.pipelineStage.findMany({
      where: { pipelineId },
      orderBy: { order: 'asc' },
    });
  }

  async createStage(pipelineId: string, dto: CreatePipelineStageDto) {
    await this.findPipelineOrThrow(pipelineId);
    return this.tenantContext.tx.pipelineStage.create({
      data: { pipelineId, name: dto.name, order: dto.order, isWon: dto.isWon ?? false, isLost: dto.isLost ?? false },
    });
  }

  async updateStage(pipelineId: string, stageId: string, dto: UpdatePipelineStageDto) {
    await this.findPipelineOrThrow(pipelineId);
    const stage = await this.tenantContext.tx.pipelineStage.findUnique({ where: { id: stageId } });
    // PipelineStage has no organizationId of its own — RLS scopes it through
    // its parent Pipeline (docs/database/rls-policies.sql), so a stage from
    // a different pipeline/org just won't be found here.
    if (!stage || stage.pipelineId !== pipelineId) {
      throw new NotFoundException('Pipeline stage not found.');
    }
    return this.tenantContext.tx.pipelineStage.update({ where: { id: stageId }, data: dto });
  }

  // FR-029 — deliberately basic: total value of the pipeline's still-open
  // deals (excludes Won/Lost, matching the Dashboard wireframe's "Pipeline $"
  // being a distinct figure from "Won/Lost" counts, docs/ui-ux/README.md
  // §5.1) plus a count of deals per stage (every stage, including Won/Lost).
  async getMetrics(pipelineId: string) {
    await this.findPipelineOrThrow(pipelineId);

    const stages = await this.tenantContext.tx.pipelineStage.findMany({ where: { pipelineId } });
    const openStageIds = stages.filter((stage) => !stage.isWon && !stage.isLost).map((stage) => stage.id);

    const [openValueSum, dealsByStage] = await Promise.all([
      this.tenantContext.tx.deal.aggregate({
        where: { pipelineStageId: { in: openStageIds } },
        _sum: { value: true },
      }),
      this.tenantContext.tx.deal.groupBy({
        by: ['pipelineStageId'],
        where: { pipelineStageId: { in: stages.map((stage) => stage.id) } },
        _count: { _all: true },
      }),
    ]);

    const countByStage: Record<string, number> = Object.fromEntries(stages.map((stage) => [stage.id, 0]));
    for (const row of dealsByStage) {
      countByStage[row.pipelineStageId] = row._count._all;
    }

    return {
      totalValue: Number(openValueSum._sum.value ?? 0),
      countByStage,
    };
  }

  private async findPipelineOrThrow(pipelineId: string) {
    const pipeline = await this.tenantContext.tx.pipeline.findUnique({ where: { id: pipelineId } });
    if (!pipeline) {
      throw new NotFoundException('Pipeline not found.');
    }
    return pipeline;
  }
}
