import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdatePipelineStageDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
