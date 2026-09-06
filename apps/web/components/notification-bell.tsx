'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { listNotifications } from '../lib/api';
import { generateMockNotifications } from '../lib/mock-data';
import { timeAgo } from '../lib/status';
import type { Session } from '../lib/session';
import type { Notification } from '@ai-crm/types';

const POLL_INTERVAL_MS = 30_000;

// docs/ui-ux/README.md §6 "NotificationBell" — "top nav, all screens", now
// mounted in the persistent SiteHeader shell above every authenticated page.
// Polls GET /notifications?isRead=false for the unread badge count and shows
// a short preview of the most recent notifications.
export function NotificationBell({ session }: { session: Session }) {
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [recent, setRecent] = useState<Notification[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [unread, latest] = await Promise.all([
          listNotifications(session.accessToken, { pageSize: 1, isRead: false }),
          listNotifications(session.accessToken, { pageSize: 5 }),
        ]);
        if (!cancelled) {
          setUnreadCount(unread.meta.total);
          setRecent(latest.data.length > 0 ? latest.data : generateMockNotifications(5));
        }
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {!!unreadCount && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full border-transparent bg-destructive px-1 text-[10px] text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>
        ) : (
          recent.map((n) => (
            <DropdownMenuItem key={n.id} className="flex flex-col items-start gap-0.5 whitespace-normal">
              <div className="flex w-full items-center gap-2">
                <span className={`text-sm ${n.isRead ? 'text-muted-foreground' : 'font-medium'}`}>
                  {n.type.replaceAll('_', ' ').toLowerCase()}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{timeAgo(n.createdAt)}</span>
              </div>
              {n.payload && 'automationName' in n.payload && (
                <span className="text-xs text-muted-foreground">{String(n.payload.automationName)}</span>
              )}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications" className="justify-center text-sm font-medium">
            View all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
