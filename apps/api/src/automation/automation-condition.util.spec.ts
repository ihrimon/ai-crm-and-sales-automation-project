import { isValidConditionShape, matchesCondition } from './automation-condition.util';

describe('automation-condition.util', () => {
  describe('isValidConditionShape', () => {
    it('accepts null/undefined (no condition = always matches)', () => {
      expect(isValidConditionShape(null)).toBe(true);
      expect(isValidConditionShape(undefined)).toBe(true);
    });

    it('accepts a well-formed rule', () => {
      expect(isValidConditionShape({ field: 'score', operator: 'gt', value: 80 })).toBe(true);
    });

    it('rejects a non-object', () => {
      expect(isValidConditionShape('score > 80')).toBe(false);
      expect(isValidConditionShape(42)).toBe(false);
    });

    it('rejects an unsupported operator', () => {
      expect(isValidConditionShape({ field: 'score', operator: 'startsWith', value: 'x' })).toBe(false);
    });

    it('rejects a missing field/value', () => {
      expect(isValidConditionShape({ operator: 'eq', value: 1 })).toBe(false);
      expect(isValidConditionShape({ field: 'score', operator: 'eq' })).toBe(false);
    });
  });

  describe('matchesCondition', () => {
    it('always matches when conditionJson is null', () => {
      expect(matchesCondition(null, {})).toBe(true);
    });

    it('does not match an invalid condition shape (fails closed)', () => {
      expect(matchesCondition({ field: 'score' }, { score: 100 })).toBe(false);
    });

    it('does not match when the field is absent from context', () => {
      expect(matchesCondition({ field: 'score', operator: 'gt', value: 80 }, {})).toBe(false);
    });

    it.each([
      ['eq', 'High', 'High', true],
      ['eq', 'High', 'Low', false],
      ['neq', 'High', 'Low', true],
      ['neq', 'High', 'High', false],
    ])('%s: %p vs %p -> %p', (operator, actual, value, expected) => {
      expect(matchesCondition({ field: 'x', operator: operator as never, value }, { x: actual })).toBe(expected);
    });

    it.each([
      ['gt', 90, 80, true],
      ['gt', 70, 80, false],
      ['gte', 80, 80, true],
      ['lt', 70, 80, true],
      ['lte', 80, 80, true],
    ])('%s: %p vs %p -> %p', (operator, actual, value, expected) => {
      expect(matchesCondition({ field: 'x', operator: operator as never, value }, { x: actual })).toBe(expected);
    });

    it('numeric operators do not match when the context value is not a number', () => {
      expect(matchesCondition({ field: 'x', operator: 'gt', value: 80 }, { x: 'ninety' })).toBe(false);
    });

    it('contains matches a case-insensitive substring', () => {
      expect(matchesCondition({ field: 'source', operator: 'contains', value: 'web' }, { source: 'Webinar' })).toBe(true);
      expect(matchesCondition({ field: 'source', operator: 'contains', value: 'cold-call' }, { source: 'Webinar' })).toBe(false);
    });
  });
});
