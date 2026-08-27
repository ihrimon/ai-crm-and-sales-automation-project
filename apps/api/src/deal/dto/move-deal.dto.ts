import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class MoveDealDto {
  @IsUUID()
  pipelineStageId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  lostReason?: string;
}
