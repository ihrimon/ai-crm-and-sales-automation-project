import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePipelineStageDto } from './dto/create-pipeline-stage.dto';
import { UpdatePipelineStageDto } from './dto/update-pipeline-stage.dto';
import { PipelineService } from './pipeline.service';

// FR-027–FR-029, routes matching docs/api/openapi.yaml's Pipelines group.
@Controller('pipelines')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  findAll() {
    return this.pipelineService.findAllPipelines();
  }

  @Get(':pipelineId/stages')
  listStages(@Param('pipelineId') pipelineId: string) {
    return this.pipelineService.listStages(pipelineId);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Post(':pipelineId/stages')
  createStage(@Param('pipelineId') pipelineId: string, @Body() dto: CreatePipelineStageDto) {
    return this.pipelineService.createStage(pipelineId, dto);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Patch(':pipelineId/stages/:stageId')
  updateStage(
    @Param('pipelineId') pipelineId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdatePipelineStageDto,
  ) {
    return this.pipelineService.updateStage(pipelineId, stageId, dto);
  }

  @Get(':pipelineId/metrics')
  getMetrics(@Param('pipelineId') pipelineId: string) {
    return this.pipelineService.getMetrics(pipelineId);
  }
}
