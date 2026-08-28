import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskService } from './task.service';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-031–FR-032, routes matching docs/api/openapi.yaml's Tasks group.
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Get()
  findAll(@Query() query: ListTasksQueryDto) {
    return this.taskService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateTaskDto) {
    return this.taskService.create(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':taskId')
  update(@Param('taskId') taskId: string, @Body() dto: UpdateTaskDto) {
    return this.taskService.update(taskId, dto);
  }
}
