import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AiAnalysisService } from './ai-analysis.service';
import { RequestAiAnalysisDto } from './dto/request-ai-analysis.dto';

const AI_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-036–FR-038, FR-040, FR-051 🔎, routes matching docs/api/openapi.yaml's
// AI group. Unlike most GETs in this app, VIEWER has no access here at all
// (docs/api/README.md §4) — not just a narrower write scope.
@Roles(...AI_ROLES)
@Controller('leads/:leadId/ai-analyses')
export class AiAnalysisController {
  constructor(private readonly aiAnalysisService: AiAnalysisService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  requestAnalysis(@Param('leadId') leadId: string, @Body() dto: RequestAiAnalysisDto) {
    return this.aiAnalysisService.requestAnalysis(leadId, dto);
  }

  @Get(':analysisId')
  getAnalysis(@Param('leadId') leadId: string, @Param('analysisId') analysisId: string) {
    return this.aiAnalysisService.getAnalysis(leadId, analysisId);
  }
}
