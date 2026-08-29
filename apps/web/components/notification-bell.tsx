'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listNotifications } from '../lib/api';
import type { Session } from '../lib/session';

const POLL_INTERVAL_MS = 30_000;

// docs/ui-ux/README.md §6 "NotificationBell" — "top nav, all screens";
// this codebase has no persistent nav shell yet, so it's mounted on the
// homepage (the de-facto signed-in hub every other nav link also lives on).
// Polls GET /notifications?isRead=false for the unread badge count.
export function NotificationBell({ session }: { session: Session }) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const result = await listNotifications(session.accessToken, { pageSize: 1, isRead: false });
        if (!cancelled) setUnreadCount(result.meta.total);
      } catch {
        // Best-effort UI affordance — a failed poll just leaves the last
        // known count in place rather than surfacing an error banner.
      }
    }

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session.accessToken]);

  return (
    <Link href="/notifications" className="relative rounded border border-neutral-300 px-4 py-2 text-sm font-medium">
      🔔 Notifications
      {!!unreadCount && (
        <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
          {unreadCount}
        </span>
      )}
    </Link>
  );
}
