import type { AuthTokens } from '@ai-crm/types';

const STORAGE_KEY = 'ai-crm.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

// Decodes the (unencrypted, signed) JWT payload to read the `email` claim for
// display purposes only — never used for an authorization decision, the
// server is always the source of truth for that.
function decodeEmailFromAccessToken(accessToken: string): string {
  try {
    const [, payload] = accessToken.split('.');
    const decoded = JSON.parse(atob(payload)) as { email?: string };
    return decoded.email ?? '';
  } catch {
    return '';
  }
}

export function saveSession(tokens: AuthTokens): Session {
  const session: Session = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    email: decodeEmailFromAccessToken(tokens.accessToken),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function readSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
