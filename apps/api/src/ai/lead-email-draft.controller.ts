import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEmailDraftDto } from './dto/create-email-draft.dto';
import { EmailDraftService } from './email-draft.service';

const AI_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-039, matching docs/api/openapi.yaml's POST /leads/:leadId/email-drafts.
@Controller('leads/:leadId/email-drafts')
export class LeadEmailDraftController {
  constructor(private readonly emailDraftService: EmailDraftService) {}

  @Roles(...AI_ROLES)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  requestDraft(@Param('leadId') leadId: string, @Body() dto: CreateEmailDraftDto) {
    return this.emailDraftService.requestDraft(leadId, dto);
  }
}
