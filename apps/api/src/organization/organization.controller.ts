import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SkipTenantScope } from '../common/decorators/skip-tenant-scope.decorator';
import type { AuthenticatedUser } from '../common/guards/jwt-auth.guard';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { ListMembersQueryDto } from './dto/list-members-query.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationService } from './organization.service';

// FR-006–FR-012, routes matching docs/api/openapi.yaml's Organizations &
// Members group exactly. Every route except `create` requires tenant scope
// (default — see TenantScopeInterceptor); the :organizationId path param is
// enforced there to equal the caller's own active organization.
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  @SkipTenantScope()
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrganizationDto) {
    return this.organizationService.create(user.sub, dto);
  }

  @Get(':organizationId')
  getOne() {
    return this.organizationService.getById();
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Patch(':organizationId')
  update(@Body() dto: UpdateOrganizationDto) {
    return this.organizationService.update(dto);
  }

  @Get(':organizationId/members')
  listMembers(@Query() query: ListMembersQueryDto) {
    return this.organizationService.listMembers(query);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Post(':organizationId/members')
  inviteMember(@Body() dto: InviteMemberDto) {
    return this.organizationService.inviteMember(dto);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Patch(':organizationId/members/:memberId')
  updateMember(@Param('memberId') memberId: string, @Body() dto: UpdateMemberDto) {
    return this.organizationService.updateMember(memberId, dto);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @Delete(':organizationId/members/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(@Param('memberId') memberId: string) {
    return this.organizationService.removeMember(memberId);
  }
}
