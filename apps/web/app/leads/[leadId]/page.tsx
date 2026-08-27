'use client';

import type { Lead } from '@ai-crm/types';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, deleteLead, getLead, updateLead } from '../../../lib/api';
import { readSession, type Session } from '../../../lib/session';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];

// FR-014, FR-015, FR-016 · docs/ui-ux/README.md §5.3 "/leads/:id" wireframe
// (DETAILS section only — Activity Timeline/AI panel/Tasks land with
// M5/M6, not built ahead of the milestones that actually implement them).
export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canWrite = session?.role !== 'VIEWER';
  const canDelete = session?.role === 'OWNER' || session?.role === 'ADMIN' || session?.role === 'SALES_MANAGER';

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
    getLead(current.accessToken, params.leadId)
      .then(setLead)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this lead.'));
  }, [router, params.leadId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !lead) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateLead(session.accessToken, lead.id, {
        name: lead.name,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        status: lead.status,
      });
      setLead(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!session || !lead) return;
    setIsDeleting(true);
    try {
      await deleteLead(session.accessToken, lead.id);
      router.push('/leads');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this lead.');
      setIsDeleting(false);
    }
  }

  if (error && !lead) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
        <Link href="/leads" className="text-sm underline">
          Back to Leads
        </Link>
      </main>
    );
  }

  if (!lead) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-8">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <Link href="/leads" className="text-sm text-neutral-500 underline">
          ← Leads
        </Link>
        {canDelete && (
          <button type="button" onClick={handleDelete} disabled={isDeleting} className="text-sm text-red-600 underline">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>

      <h1 className="text-2xl font-semibold">{lead.name}</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            type="text"
            value={lead.name}
            disabled={!canWrite}
            onChange={(e) => setLead({ ...lead, name: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={lead.email ?? ''}
            disabled={!canWrite}
            onChange={(e) => setLead({ ...lead, email: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="phone" className="text-sm font-medium">
            Phone
          </label>
          <input
            id="phone"
            type="text"
            value={lead.phone ?? ''}
            disabled={!canWrite}
            onChange={(e) => setLead({ ...lead, phone: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            value={lead.status}
            disabled={!canWrite}
            onChange={(e) => setLead({ ...lead, status: e.target.value as Lead['status'] })}
            className="rounded border border-neutral-300 px-2 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <p className="text-sm text-neutral-500">Owner: {lead.ownerId ?? 'Unassigned'}</p>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {canWrite && (
          <button
            type="submit"
            disabled={isSaving}
            className="mt-2 self-start rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </form>
    </main>
  );
}
