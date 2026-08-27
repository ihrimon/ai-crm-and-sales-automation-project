import type { AuthTokens, OrgRole } from '@ai-crm/types';

const STORAGE_KEY = 'ai-crm.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
  organizationId?: string;
  role?: OrgRole;
}

interface AccessTokenClaims {
  email?: string;
  organizationId?: string;
  role?: OrgRole;
}

// Decodes the (unencrypted, signed) JWT payload for display/routing purposes
// only — never used for an authorization decision, the server is always the
// source of truth for that (every request re-derives/re-checks server-side).
function decodeAccessToken(accessToken: string): AccessTokenClaims {
  try {
    const [, payload] = accessToken.split('.');
    return JSON.parse(atob(payload)) as AccessTokenClaims;
  } catch {
    return {};
  }
}

export function saveSession(tokens: AuthTokens): Session {
  const claims = decodeAccessToken(tokens.accessToken);
  const session: Session = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    email: claims.email ?? '',
    organizationId: claims.organizationId,
    role: claims.role,
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
