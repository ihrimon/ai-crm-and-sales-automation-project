import { IsOptional, IsString } from 'class-validator';

export class CreateEmailDraftDto {
  @IsOptional()
  @IsString()
  tone?: string;
}
