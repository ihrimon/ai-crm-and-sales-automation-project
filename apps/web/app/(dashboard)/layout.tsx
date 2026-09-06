'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { logout as apiLogout, listNotifications } from '@/lib/api';
import { clearSession, readSession, type Session } from '@/lib/session';

// Every authenticated route (dashboard, leads, deals, pipeline, contacts,
// companies, tasks, automations, team, audit-log, notifications, settings)
// renders inside this shell: a persistent collapsible sidebar + top bar,
// shadcn "sidebar-07" block style. Auth/onboarding screens stay outside it —
// they render with just the root layout.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const current = readSession();
    if (!current) {
      router.replace('/login');
      return;
    }
    if (!current.organizationId) {
      router.replace('/onboarding');
      return;
    }
    setSession(current);
    listNotifications(current.accessToken, { pageSize: 1, isRead: false })
      .then((res) => setUnreadCount(res.meta.total))
      .catch(() => undefined);
  }, [router]);

  async function handleLogout() {
    if (!session) return;
    try {
      await apiLogout(session.accessToken);
    } finally {
      clearSession();
      router.replace('/login');
    }
  }

  if (!session) {
    return null;
  }

  return (
    <SidebarProvider>
      <AppSidebar session={session} unreadCount={unreadCount} onLogout={handleLogout} />
      <SidebarInset>
        <SiteHeader session={session} />
        <div className="flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
