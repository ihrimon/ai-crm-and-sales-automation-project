import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// 🔎 Custom, reorderable stages per organization (guideline/03-crm-core-and-pipeline.md).
export class CreatePipelineStageDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  order!: number;

  @IsOptional()
  @IsBoolean()
  isWon?: boolean;

  @IsOptional()
  @IsBoolean()
  isLost?: boolean;
}
