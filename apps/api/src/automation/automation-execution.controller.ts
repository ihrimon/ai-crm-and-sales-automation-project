import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationExecutionService } from './automation-execution.service';
import { ListExecutionsQueryDto } from './dto/list-executions-query.dto';

// FR-045, FR-052 🔎, routes matching docs/api/openapi.yaml's
// automation-executions group. Unlike the Automation CRUD controller,
// SALES_REP is included — "(own)" per docs/api/README.md §4. approve/reject
// need @HttpCode(HttpStatus.OK) — the exact same non-creation-@Post()
// contract bug M3's assignLead and M4's moveDeal already caught (NestJS
// defaults every @Post() to 201).
@Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP)
@Controller('automation-executions')
export class AutomationExecutionController {
  constructor(private readonly executionService: AutomationExecutionService) {}

  @Get()
  findAll(@Query() query: ListExecutionsQueryDto) {
    return this.executionService.findAll(query);
  }

  @Post(':executionId/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('executionId') executionId: string) {
    return this.executionService.approve(executionId);
  }

  @Post(':executionId/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('executionId') executionId: string) {
    return this.executionService.reject(executionId);
  }
}
