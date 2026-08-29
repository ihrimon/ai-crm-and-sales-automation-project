import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import { sanitizeForAudit } from './audit-sanitize.util';
import type { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';

export interface RecordAuditParams {
  entityType: string;
  entityId: string;
  action: AuditAction;
  oldValue?: unknown;
  newValue?: unknown;
}

// FR-048. `record()` is called from LeadService/DealService/
// OrganizationService after a successful write — deliberately never throws
// back to the caller (guideline/16-operations-and-compliance.md §41 frames
// this as a "should," and the same "a side effect must never break the
// primary operation" philosophy M7's AutomationTriggerService established
// applies here, centralized in one place instead of a try/catch duplicated
// at every call site).
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly tenantContext: TenantContextService) {}

  async record(params: RecordAuditParams): Promise<void> {
    try {
      await this.tenantContext.tx.auditLog.create({
        data: {
          organizationId: this.tenantContext.organizationId,
          actorUserId: this.tenantContext.userId,
          entityType: params.entityType,
          entityId: params.entityId,
          action: params.action,
          oldValue: params.oldValue !== undefined ? (sanitizeForAudit(params.oldValue) as Prisma.InputJsonValue) : Prisma.DbNull,
          newValue: params.newValue !== undefined ? (sanitizeForAudit(params.newValue) as Prisma.InputJsonValue) : Prisma.DbNull,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to record audit log for ${params.entityType} ${params.entityId} (${params.action})`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async findAll(query: ListAuditLogsQueryDto) {
    const { page, pageSize, entityType, entityId } = query;
    const where: { entityType?: string; entityId?: string } = {};
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [data, total] = await Promise.all([
      this.tenantContext.tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.auditLog.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }
}
