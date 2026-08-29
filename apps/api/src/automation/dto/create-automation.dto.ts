import { AutomationActionType, AutomationTriggerType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isValidConditionShape } from '../automation-condition.util';

@ValidatorConstraint({ name: 'isValidCondition', async: false })
class IsValidConditionConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidConditionShape(value);
  }
  defaultMessage(): string {
    return 'conditionJson must be omitted, or an object shaped as { field: string, operator: eq|neq|gt|gte|lt|lte|contains, value: string|number|boolean }.';
  }
}

export class CreateAutomationDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEnum(AutomationTriggerType)
  triggerType!: AutomationTriggerType;

  @IsOptional()
  @Validate(IsValidConditionConstraint)
  conditionJson?: object;

  @IsEnum(AutomationActionType)
  actionType!: AutomationActionType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
