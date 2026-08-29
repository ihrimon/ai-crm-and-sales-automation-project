import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

// class-transformer's @Type(() => Boolean) coerces via the Boolean()
// constructor, and Boolean('false') is `true` (any non-empty string is
// truthy) — a real bug this milestone's own integration test caught for
// ?isRead=false. Parse the raw query string explicitly instead.
function parseBooleanQueryParam({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class ListNotificationsQueryDto {
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
  @Transform(parseBooleanQueryParam)
  @IsBoolean()
  isRead?: boolean;
}
