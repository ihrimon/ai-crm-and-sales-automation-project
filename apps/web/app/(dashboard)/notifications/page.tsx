'use client';

import type { Notification } from '@ai-crm/types';
import { Bell, BellOff } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, listNotifications, markNotificationRead } from '@/lib/api';
import { generateMockNotifications } from '@/lib/mock-data';
import { timeAgo } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

export default function NotificationsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: Session, onlyUnread: boolean) => {
    try {
      const result = await listNotifications(current.accessToken, { pageSize: 50, isRead: onlyUnread ? false : undefined });
      if (result.data.length === 0 && !onlyUnread) {
        setNotifications(generateMockNotifications(6));
        setIsSample(true);
      } else {
        setNotifications(result.data);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load notifications.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current, unreadOnly);
  }, [load, unreadOnly]);

  async function handleMarkRead(notification: Notification) {
    if (!session || notification.isRead || isSample) return;
    setError(null);
    try {
      const updated = await markNotificationRead(session.accessToken, notification.id);
      setNotifications((prev) =>
        prev ? (unreadOnly ? prev.filter((n) => n.id !== updated.id) : prev.map((n) => (n.id === updated.id ? updated : n))) : prev,
      );
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not mark this notification read.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Updates about your leads, deals, and automations."
        actions={isSample ? <SampleDataBadge /> : undefined}
      />

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={unreadOnly} onCheckedChange={(v) => setUnreadOnly(v === true)} />
        Unread only
      </label>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {notifications === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <BellOff className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}</p>
            </div>
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li key={notification.id} className={`flex items-center gap-3 p-4 ${notification.isRead ? 'opacity-60' : ''}`}>
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted">
                    <Bell className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{notification.type.replaceAll('_', ' ').toLowerCase()}</span>
                    {notification.payload && 'automationName' in notification.payload && (
                      <span className="text-xs text-muted-foreground">{String(notification.payload.automationName)}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{timeAgo(notification.createdAt)}</span>
                  {!notification.isRead && (
                    <Button variant="ghost" size="sm" onClick={() => handleMarkRead(notification)}>
                      Mark read
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
