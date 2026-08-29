// FR-048's Definition of Done (docs/development-plan/README.md §M8):
// AuditLog.oldValue/newValue must never capture passwordHash or other
// secrets when a User-adjacent record changes. This strips any key whose
// name matches a known-sensitive substring, recursively, regardless of
// which entity happens to be audited — defense in depth rather than trusting
// every future audit call site to remember on its own.
const SENSITIVE_KEY_SUBSTRINGS = ['passwordhash', 'password', 'tokenhash', 'token', 'secret'];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_SUBSTRINGS.some((needle) => lower.includes(needle));
}

function stripSensitiveKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveKeys);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (isSensitiveKey(key)) continue;
      result[key] = stripSensitiveKeys(nested);
    }
    return result;
  }
  return value;
}

// JSON.parse(JSON.stringify(...)) forces the same "JSON-safe" conversion
// Prisma's Json field requires (Decimal/Date -> primitives via their own
// toJSON()) before the sensitive-key strip runs — matching the M4 lesson
// that Prisma.Decimal doesn't survive being handed to something expecting
// plain JSON without an explicit conversion step.
export function sanitizeForAudit(value: unknown): Record<string, unknown> {
  const jsonSafe = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  return stripSensitiveKeys(jsonSafe) as Record<string, unknown>;
}
