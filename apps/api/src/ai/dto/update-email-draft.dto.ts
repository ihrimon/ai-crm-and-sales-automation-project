import { EmailDraftStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString } from 'class-validator';

// PENDING/FAILED are worker-only states (set by AiProcessor, never by a
// client) — a PATCH can only move a draft to DRAFT, DISCARDED, or
// SENT_MANUALLY.
const CLIENT_SETTABLE_STATUSES = [EmailDraftStatus.DRAFT, EmailDraftStatus.DISCARDED, EmailDraftStatus.SENT_MANUALLY];

export class UpdateEmailDraftDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsIn(CLIENT_SETTABLE_STATUSES)
  status?: EmailDraftStatus;
}
