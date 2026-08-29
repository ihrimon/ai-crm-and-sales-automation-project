'use client';

import type { AuditLog } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, listAuditLogs } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-048 · docs/ui-ux/README.md §4 "/audit-log" screen (OWNER/ADMIN/VIEWER
// only). A SALES_MANAGER/SALES_REP who navigates here directly gets the same
// server-side 403 the API already enforces (docs/api/openapi.yaml x-roles) —
// same pattern as /automations not client-gating its own visibility.
export default function AuditLogPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: Session, filters: { entityType: string; entityId: string }) => {
    try {
      const result = await listAuditLogs(current.accessToken, {
        pageSize: 50,
        entityType: filters.entityType || undefined,
        entityId: filters.entityId || undefined,
      });
      setLogs(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load audit logs.');
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
    void load(current, { entityType: '', entityId: '' });
  }, [router, load]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await load(session, { entityType, entityId });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit Log</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Entity type (e.g. Lead)"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="text"
          placeholder="Entity id"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {logs === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-neutral-500">No audit log entries match this filter.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">When</th>
              <th className="py-2">Entity</th>
              <th className="py-2">Action</th>
              <th className="py-2">Actor</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-neutral-100 align-top">
                <td className="py-2 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="py-2">
                  {log.entityType} <span className="text-neutral-400">{log.entityId}</span>
                </td>
                <td className="py-2">{log.action}</td>
                <td className="py-2">{log.actorUserId ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
