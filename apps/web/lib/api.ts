import type { ApiError, AuthTokens, LoginRequest, RegisterRequest, User } from '@ai-crm/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:34001/api/v1';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

async function parseErrorAndThrow(response: Response): Promise<never> {
  let body: ApiError | undefined;
  try {
    body = (await response.json()) as ApiError;
  } catch {
    // fall through to the generic message below
  }
  throw new ApiRequestError(body?.error.message ?? 'Something went wrong. Please try again.', body?.error.code ?? 'UNKNOWN');
}

export async function register(payload: RegisterRequest): Promise<User> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function login(payload: LoginRequest): Promise<AuthTokens> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return parseErrorAndThrow(res);
  return res.json();
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
