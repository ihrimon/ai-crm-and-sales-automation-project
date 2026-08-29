import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { UpdateEmailDraftDto } from './dto/update-email-draft.dto';
import { EmailDraftService } from './email-draft.service';

const AI_ROLES = [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.SALES_MANAGER, OrgRole.SALES_REP];

// FR-039, matching docs/api/openapi.yaml's /email-drafts/:emailDraftId
// group. x-roles allows the same four roles through the guard for both
// routes, but updateDraft's service layer further restricts to
// creator/OWNER/ADMIN (docs/api/README.md §4) — same
// guard-allows-more-than-service write-permission-split shape as M5's Task.
@Roles(...AI_ROLES)
@Controller('email-drafts')
export class EmailDraftController {
  constructor(private readonly emailDraftService: EmailDraftService) {}

  @Get(':emailDraftId')
  getDraft(@Param('emailDraftId') emailDraftId: string) {
    return this.emailDraftService.getDraft(emailDraftId);
  }

  @Patch(':emailDraftId')
  updateDraft(@Param('emailDraftId') emailDraftId: string, @Body() dto: UpdateEmailDraftDto) {
    return this.emailDraftService.updateDraft(emailDraftId, dto);
  }
}
