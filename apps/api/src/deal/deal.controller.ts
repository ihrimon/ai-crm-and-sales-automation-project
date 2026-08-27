import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { DealService } from './deal.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { ListDealsQueryDto } from './dto/list-deals-query.dto';
import { MoveDealDto } from './dto/move-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-023–FR-026, FR-028, routes matching docs/api/openapi.yaml's Deals group.
@Controller('deals')
export class DealController {
  constructor(private readonly dealService: DealService) {}

  @Get()
  findAll(@Query() query: ListDealsQueryDto) {
    return this.dealService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateDealDto) {
    return this.dealService.create(dto);
  }

  @Get(':dealId')
  findOne(@Param('dealId') dealId: string) {
    return this.dealService.findOne(dealId);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':dealId')
  update(@Param('dealId') dealId: string, @Body() dto: UpdateDealDto) {
    return this.dealService.update(dealId, dto);
  }

  @Roles(...WRITE_ROLES)
  @Post(':dealId/move')
  @HttpCode(HttpStatus.OK)
  move(@Param('dealId') dealId: string, @Body() dto: MoveDealDto) {
    return this.dealService.move(dealId, dto);
  }
}
