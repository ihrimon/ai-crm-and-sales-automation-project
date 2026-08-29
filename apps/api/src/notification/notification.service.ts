import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { TenantContextService } from '../common/tenant/tenant-context.service';
import type { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

export interface CreateNotificationParams {
  recipientMemberId: string;
  type: string;
  payload?: Record<string, unknown>;
}

// FR-046–FR-047. Always scoped to the caller's own OrganizationMember
// (docs/api/openapi.yaml: "never another member's") — unlike Lead/Deal/Task,
// this isn't a role-dependent row-scope, every role including OWNER only
// ever sees their own notifications.
@Injectable()
export class NotificationService {
  constructor(private readonly tenantContext: TenantContextService) {}

  // Internal — called by AutomationActionService's NOTIFY action (M7), not
  // exposed as its own endpoint (FR-046 is "the system shall notify," not a
  // client-authored notification API).
  async create(params: CreateNotificationParams) {
    return this.tenantContext.tx.notification.create({
      data: {
        organizationId: this.tenantContext.organizationId,
        recipientMemberId: params.recipientMemberId,
        type: params.type,
        payload: (params.payload as Prisma.InputJsonValue) ?? undefined,
      },
    });
  }

  async findAll(query: ListNotificationsQueryDto) {
    const { page, pageSize, isRead } = query;
    const where: Prisma.NotificationWhereInput = { recipientMemberId: this.tenantContext.memberId };
    if (isRead !== undefined) where.isRead = isRead;

    const [data, total] = await Promise.all([
      this.tenantContext.tx.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.tenantContext.tx.notification.count({ where }),
    ]);
    return { data, meta: { page, pageSize, total } };
  }

  async markRead(id: string) {
    const notification = await this.tenantContext.tx.notification.findUnique({ where: { id } });
    // Same 404-not-403 row-scope convention as every other owned resource —
    // a notification addressed to someone else simply doesn't exist as far
    // as the caller is concerned.
    if (!notification || notification.recipientMemberId !== this.tenantContext.memberId) {
      throw new NotFoundException('Notification not found.');
    }
    return this.tenantContext.tx.notification.update({ where: { id }, data: { isRead: true } });
  }
}
