import { Type } from 'class-transformer';
import { TaskStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// api/README.md §2 pagination convention — ?page=&pageSize= (default 20, max 100).
export class ListTasksQueryDto {
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
  @IsUUID()
  assignedToId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  dealId?: string;
}
