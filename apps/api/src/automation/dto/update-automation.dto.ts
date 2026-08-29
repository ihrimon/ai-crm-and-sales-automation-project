import { AutomationActionType, AutomationTriggerType } from '@prisma/client';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, Validate, ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';
import { isValidConditionShape } from '../automation-condition.util';

@ValidatorConstraint({ name: 'isValidConditionUpdate', async: false })
class IsValidConditionUpdateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidConditionShape(value);
  }
  defaultMessage(): string {
    return 'conditionJson must be omitted, or an object shaped as { field: string, operator: eq|neq|gt|gte|lt|lte|contains, value: string|number|boolean }.';
  }
}

// Same reason a dedicated *Update schema exists for Lead/Contact/Company/Deal
// (docs/development-plan/README.md §4.1c-d, §4.1g): docs/api/openapi.yaml's
// updateAutomation operation reused AutomationCreate, which has
// required: [name, triggerType, actionType] — forcing every PATCH to resend
// all three. Fixed the same way, with every field optional.
export class UpdateAutomationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEnum(AutomationTriggerType)
  triggerType?: AutomationTriggerType;

  @IsOptional()
  @Validate(IsValidConditionUpdateConstraint)
  conditionJson?: object;

  @IsOptional()
  @IsEnum(AutomationActionType)
  actionType?: AutomationActionType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
