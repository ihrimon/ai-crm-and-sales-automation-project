'use client';

import type { Notification } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, listNotifications, markNotificationRead } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-046–FR-047 · docs/ui-ux/README.md §4 "/notifications" screen: `GET
// /notifications`, `PATCH /notifications/:id/read` — always scoped to the
// caller's own OrganizationMember, no role-gating (every role sees this).
export default function NotificationsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: Session, onlyUnread: boolean) => {
    try {
      const result = await listNotifications(current.accessToken, { pageSize: 50, isRead: onlyUnread ? false : undefined });
      setNotifications(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load notifications.');
    }
  }, []);

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
    void load(current, unreadOnly);
  }, [router, load, unreadOnly]);

  async function handleMarkRead(notification: Notification) {
    if (!session || notification.isRead) return;
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
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
        Unread only
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {notifications === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-neutral-500">{unreadOnly ? 'No unread notifications.' : 'No notifications yet.'}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`flex items-center gap-3 rounded border border-neutral-200 px-3 py-2 ${notification.isRead ? 'opacity-60' : ''}`}
            >
              <span className="font-medium">{notification.type}</span>
              {notification.payload && 'automationName' in notification.payload && (
                <span className="text-neutral-500">{String(notification.payload.automationName)}</span>
              )}
              <span className="ml-auto text-neutral-400">{new Date(notification.createdAt).toLocaleString()}</span>
              {!notification.isRead && (
                <button type="button" onClick={() => handleMarkRead(notification)} className="text-sm underline">
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
