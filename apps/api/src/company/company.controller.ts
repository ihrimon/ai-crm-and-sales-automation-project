import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesQueryDto } from './dto/list-companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-021–FR-022, routes matching docs/api/openapi.yaml's Companies group.
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  findAll(@Query() query: ListCompaniesQueryDto) {
    return this.companyService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companyService.create(dto);
  }

  @Get(':companyId')
  findOne(@Param('companyId') companyId: string) {
    return this.companyService.findOne(companyId);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':companyId')
  update(@Param('companyId') companyId: string, @Body() dto: UpdateCompanyDto) {
    return this.companyService.update(companyId, dto);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER)
  @Delete(':companyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('companyId') companyId: string) {
    return this.companyService.remove(companyId);
  }
}
