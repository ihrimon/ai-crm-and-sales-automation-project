'use client';

import type { Lead } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createLead, listLeads } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

const STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];

// FR-013–FR-018, FR-050 🔎 · docs/ui-ux/README.md §5.2 "/leads" wireframe
// (simplified: table + search/status filter + pagination + New Lead, role-gated).
export default function LeadsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const pageSize = 20;
  const canCreate = session?.role !== 'VIEWER';

  const load = useCallback(async (current: Session, currentPage: number, currentSearch: string, currentStatus: string) => {
    try {
      const result = await listLeads(current.accessToken, {
        page: currentPage,
        pageSize,
        search: currentSearch || undefined,
        status: currentStatus || undefined,
      });
      setLeads(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load leads.');
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
    void load(current, page, search, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, page]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPage(1);
    await load(session, 1, search, status);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      await createLead(session.accessToken, { name: newName });
      setNewName('');
      setShowNewForm(false);
      await load(session, page, search, status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create lead.');
    } finally {
      setIsCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <div className="flex items-center gap-3">
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            >
              + New Lead
            </button>
          )}
          <Link href="/" className="text-sm text-neutral-500 underline">
            Back
          </Link>
        </div>
      </div>

      {canCreate && showNewForm && (
        <form onSubmit={handleCreate} className="flex gap-2 rounded border border-neutral-200 p-4">
          <input
            type="text"
            required
            placeholder="Lead name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isCreating}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      <form onSubmit={handleFilterSubmit} className="flex gap-2">
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-neutral-300 px-2 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {leads === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {search || status ? 'No leads match these filters.' : 'No leads yet — create your first one above.'}
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
              <th className="py-2">Score</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-b border-neutral-100">
                <td className="py-2">
                  <Link href={`/leads/${lead.id}`} className="underline">
                    {lead.name}
                  </Link>
                </td>
                <td className="py-2">{lead.status}</td>
                <td className="py-2">{lead.score ?? '—'}</td>
                <td className="py-2">{new Date(lead.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="underline disabled:no-underline disabled:opacity-40"
        >
          ‹ Prev
        </button>
        <span>
          Page {page} of {totalPages} — {total} total
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="underline disabled:no-underline disabled:opacity-40"
        >
          Next ›
        </button>
      </div>
    </main>
  );
}
