'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { logout as apiLogout } from '../lib/api';
import { clearSession, readSession, type Session } from '../lib/session';

// Milestone M1 added real /login and /register screens; M2 added
// /onboarding, /team, /settings; M3 added /leads, /contacts, /companies;
// M4 added /deals, /deals/:id, /pipeline; M5 added /dashboard, /tasks; M6
// added the AI panel on /leads/:id; M7 added /automations,
// /automations/approvals. This placeholder doubles as the minimal proof
// each milestone asks for: signed-in state persists across a reload, a
// signed-in user with no organization yet is routed to onboard one, and
// logout actually revokes the session server-side (FR-003).
export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    const current = readSession();
    setSession(current);
    if (current && !current.organizationId) {
      router.replace('/onboarding');
    }
  }, [router]);

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

  if (session?.organizationId) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Signed in as {session.email}</h1>
        <p className="text-sm text-neutral-500">Role: {session.role}</p>
        <p className="max-w-md text-sm text-neutral-500">
          The rest of the app (Notifications, Audit Log, …) lands in later milestones — see{' '}
          <code>docs/development-plan/README.md</code>.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/dashboard" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Dashboard
          </Link>
          <Link href="/leads" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Leads
          </Link>
          <Link href="/deals" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Deals
          </Link>
          <Link href="/pipeline" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Pipeline
          </Link>
          <Link href="/contacts" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Contacts
          </Link>
          <Link href="/companies" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Companies
          </Link>
          <Link href="/tasks" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Tasks
          </Link>
          <Link href="/automations" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Automations
          </Link>
          <Link href="/team" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Team
          </Link>
          <Link href="/settings" className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
            Settings
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isLoggingOut ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </main>
    );
  }

  if (session) {
    // Signed in, no organization yet — the effect above already redirects to
    // /onboarding; this is just what renders in the instant before that.
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">AI CRM & Sales Automation</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Milestone M7 — Automation Engine is live. See <code>docs/development-plan/README.md</code> for what&apos;s
        next.
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
