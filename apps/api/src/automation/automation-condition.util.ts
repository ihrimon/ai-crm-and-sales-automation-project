// guideline/05-automation.md's own sketch of a condition ("Score > X, Stage =
// Y, Field Matches ...") — deliberately a small, generic {field, operator,
// value} matcher, not a full expression language. `conditionJson` in
// schema.prisma/openapi.yaml is an untyped JSON object, so this is the
// application-level shape imposed on it (matches the "Invalid configurations
// cannot be activated" clause of AC-019).

export const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface ConditionRule {
  field: string;
  operator: ConditionOperator;
  value: string | number | boolean;
}

export function isValidConditionShape(conditionJson: unknown): conditionJson is ConditionRule {
  if (conditionJson === null || conditionJson === undefined) return true; // no condition = always matches
  if (typeof conditionJson !== 'object' || Array.isArray(conditionJson)) return false;
  const rule = conditionJson as Record<string, unknown>;
  return (
    typeof rule.field === 'string' &&
    rule.field.length > 0 &&
    typeof rule.operator === 'string' &&
    (CONDITION_OPERATORS as readonly string[]).includes(rule.operator) &&
    ['string', 'number', 'boolean'].includes(typeof rule.value)
  );
}

// `context` is a flat field-name -> value map built per trigger type
// (see AutomationTriggerService) — an unknown field or a type mismatch is
// treated as "doesn't match" rather than throwing, so one malformed
// condition can't take down evaluation of every other automation.
export function matchesCondition(conditionJson: unknown, context: Record<string, unknown>): boolean {
  if (conditionJson === null || conditionJson === undefined) return true;
  if (!isValidConditionShape(conditionJson)) return false;

  const { field, operator, value } = conditionJson;
  const actual = context[field];
  if (actual === undefined) return false;

  switch (operator) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    case 'contains':
      return typeof actual === 'string' && typeof value === 'string' && actual.toLowerCase().includes(value.toLowerCase());
    default:
      return false;
  }
}
