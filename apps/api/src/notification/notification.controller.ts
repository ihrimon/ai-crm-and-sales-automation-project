import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

// FR-046–FR-047, matching docs/api/openapi.yaml's Notifications group. No
// @Roles() at all — every authenticated org member, VIEWER included, since
// this is always scoped to the caller's own notifications regardless of role.
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  findAll(@Query() query: ListNotificationsQueryDto) {
    return this.notificationService.findAll(query);
  }

  @Patch(':notificationId/read')
  markRead(@Param('notificationId') notificationId: string) {
    return this.notificationService.markRead(notificationId);
  }
}
