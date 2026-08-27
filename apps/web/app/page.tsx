'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { logout as apiLogout } from '../lib/api';
import { clearSession, readSession, type Session } from '../lib/session';

// Milestone M1 (docs/development-plan/README.md) added real /login and
// /register screens but not /dashboard — that lands with M5. Until then this
// placeholder doubles as the minimal "hold a session" proof the milestone
// asks for: signed-in state persists across a reload and logout actually
// revokes the session server-side (FR-003).
export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    setSession(readSession());
  }, []);

  async function handleLogout() {
    if (!session) return;
    setIsLoggingOut(true);
    try {
      await apiLogout(session.accessToken);
    } finally {
      clearSession();
      setSession(null);
      setIsLoggingOut(false);
    }
  }

  if (session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Signed in as {session.email}</h1>
        <p className="max-w-md text-sm text-neutral-500">
          The rest of the app (Dashboard, Leads, Deals, …) lands in later milestones — see{' '}
          <code>docs/development-plan/README.md</code>.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isLoggingOut ? 'Logging out…' : 'Log out'}
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">AI CRM & Sales Automation</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Milestone M1 — Auth is live. See <code>docs/development-plan/README.md</code> for what&apos;s next.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
          Log in
        </Link>
        <Link href="/register" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
          Register
        </Link>
      </div>
    </main>
  );
}
