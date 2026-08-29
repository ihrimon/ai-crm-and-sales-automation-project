import { Controller, Get, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AuditLogService } from './audit-log.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

// FR-048, matching docs/api/openapi.yaml's `GET /audit-logs`. Deliberately
// narrower than most read endpoints — SALES_MANAGER/SALES_REP excluded, not
// just VIEWER included (docs/api/README.md §4).
@Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.VIEWER)
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogService.findAll(query);
  }
}
