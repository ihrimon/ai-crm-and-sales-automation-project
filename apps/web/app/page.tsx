'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readSession, type Session } from '../lib/session';

// Signed-out visitors see a minimal splash; a signed-in user is routed
// straight to their dashboard (or onboarding, if they have no organization
// yet) — this page is never the persistent "hub" any more, the sidebar is.
export default function HomePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    const current = readSession();
    setSession(current);
    if (current?.organizationId) {
      router.replace('/dashboard');
    } else if (current) {
      router.replace('/onboarding');
    }
  }, [router]);

  if (session === undefined || session) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-8 text-center">
      <div className="flex items-center gap-2">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <span className="text-xl font-semibold">AI CRM &amp; Sales Automation</span>
      </div>
      <p className="max-w-md text-sm text-muted-foreground">
        An AI-native, automation-first CRM for teams that want their pipeline to work for them.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/register">Register</Link>
        </Button>
      </div>
    </main>
  );
}
