import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { LeadStatus } from '@prisma/client';

// The only fields a client may sort by — keeps `sort` a small, well-defined
// allowlist rather than an arbitrary passthrough to Prisma's orderBy.
export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'score'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

// FR-017 · api/README.md §2 pagination convention.
export class ListLeadsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(
    LEAD_SORT_FIELDS.flatMap((field) => [field, `-${field}`]),
    { message: `sort must be one of: ${LEAD_SORT_FIELDS.join(', ')} (optionally prefixed with -)` },
  )
  sort: string = '-createdAt';
}
