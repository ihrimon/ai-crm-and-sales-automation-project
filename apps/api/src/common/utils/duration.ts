const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

// Parses simple durations like "15m" / "30d" / "1h" into seconds. Deliberately
// minimal — only the units this project's .env actually uses
// (JWT_ACCESS_TOKEN_TTL, JWT_REFRESH_TOKEN_TTL) need supporting, not a
// general-purpose duration library.
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Unsupported duration format: "${value}"`);
  }
  const [, amount, unit] = match;
  return Number(amount) * UNIT_SECONDS[unit];
}
