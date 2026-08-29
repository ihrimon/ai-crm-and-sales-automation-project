import { AIAnalysisType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class RequestAiAnalysisDto {
  @IsEnum(AIAnalysisType)
  type!: AIAnalysisType;
}
