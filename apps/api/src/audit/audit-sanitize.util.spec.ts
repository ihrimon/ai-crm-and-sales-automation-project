import { sanitizeForAudit } from './audit-sanitize.util';

// FR-048's Definition of Done: oldValue/newValue must never capture
// passwordHash or other secrets, regardless of which entity is audited.
describe('sanitizeForAudit', () => {
  it('strips passwordHash and other sensitive keys at the top level', () => {
    const result = sanitizeForAudit({ id: 'user-1', email: 'a@example.com', passwordHash: 'super-secret' });
    expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('strips sensitive keys nested inside objects and arrays', () => {
    const result = sanitizeForAudit({
      id: 'org-1',
      members: [{ id: 'member-1', user: { email: 'a@example.com', passwordHash: 'secret', tokenHash: 'tok' } }],
    });
    expect(result).toEqual({
      id: 'org-1',
      members: [{ id: 'member-1', user: { email: 'a@example.com' } }],
    });
  });

  it('is case-insensitive and matches partial key names (e.g. resetTokenHash)', () => {
    const result = sanitizeForAudit({ id: 'user-1', ResetTokenHash: 'x', apiSecretKey: 'y' });
    expect(result).toEqual({ id: 'user-1' });
  });

  it('forces JSON-safety (e.g. converts Date to a string) before stripping', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = sanitizeForAudit({ createdAt: date });
    expect(result).toEqual({ createdAt: date.toISOString() });
  });
});
