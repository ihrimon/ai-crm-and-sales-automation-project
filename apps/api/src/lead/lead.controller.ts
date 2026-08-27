import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadService } from './lead.service';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];
const MANAGE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER];

// FR-013–FR-018, FR-050 🔎, routes matching docs/api/openapi.yaml's Leads group.
@Controller('leads')
export class LeadController {
  constructor(private readonly leadService: LeadService) {}

  @Get()
  findAll(@Query() query: ListLeadsQueryDto) {
    return this.leadService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.leadService.create(dto);
  }

  @Get(':leadId')
  findOne(@Param('leadId') leadId: string) {
    return this.leadService.findOne(leadId);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':leadId')
  update(@Param('leadId') leadId: string, @Body() dto: UpdateLeadDto) {
    return this.leadService.update(leadId, dto);
  }

  @Roles(...MANAGE_ROLES)
  @Delete(':leadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('leadId') leadId: string) {
    return this.leadService.remove(leadId);
  }

  @Roles(...MANAGE_ROLES)
  @Post(':leadId/assign')
  @HttpCode(HttpStatus.OK)
  assign(@Param('leadId') leadId: string, @Body() dto: AssignLeadDto) {
    return this.leadService.assign(leadId, dto);
  }
}
