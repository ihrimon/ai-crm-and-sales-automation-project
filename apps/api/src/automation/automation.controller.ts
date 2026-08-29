import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AutomationService } from './automation.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { ListAutomationsQueryDto } from './dto/list-automations-query.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

// FR-042, routes matching docs/api/openapi.yaml's Automations group.
// docs/api/README.md §4: OWNER/ADMIN/SALES_MANAGER only, for every route —
// not even a read-only SALES_REP/VIEWER allowance like most other modules.
@Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER)
@Controller('automations')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Get()
  findAll(@Query() query: ListAutomationsQueryDto) {
    return this.automationService.findAll(query);
  }

  @Post()
  create(@Body() dto: CreateAutomationDto) {
    return this.automationService.create(dto);
  }

  @Get(':automationId')
  findOne(@Param('automationId') automationId: string) {
    return this.automationService.findOne(automationId);
  }

  @Patch(':automationId')
  update(@Param('automationId') automationId: string, @Body() dto: UpdateAutomationDto) {
    return this.automationService.update(automationId, dto);
  }

  @Delete(':automationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('automationId') automationId: string): Promise<void> {
    await this.automationService.remove(automationId);
  }
}
