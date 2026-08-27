import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

const WRITE_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-019–FR-020, routes matching docs/api/openapi.yaml's Contacts group.
@Controller('contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  findAll(@Query() query: ListContactsQueryDto) {
    return this.contactService.findAll(query);
  }

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreateContactDto) {
    return this.contactService.create(dto);
  }

  @Get(':contactId')
  findOne(@Param('contactId') contactId: string) {
    return this.contactService.findOne(contactId);
  }

  @Roles(...WRITE_ROLES)
  @Patch(':contactId')
  update(@Param('contactId') contactId: string, @Body() dto: UpdateContactDto) {
    return this.contactService.update(contactId, dto);
  }

  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER)
  @Delete(':contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('contactId') contactId: string) {
    return this.contactService.remove(contactId);
  }
}
