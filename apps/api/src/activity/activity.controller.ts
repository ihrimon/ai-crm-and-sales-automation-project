import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ActivityService } from './activity.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { ListActivitiesQueryDto } from './dto/list-activities-query.dto';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-030, routes matching docs/api/openapi.yaml's Activities group.
@Controller('activities')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  findAll(@Query() query: ListActivitiesQueryDto) {
    return this.activityService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateActivityDto) {
    return this.activityService.create(dto);
  }
}
