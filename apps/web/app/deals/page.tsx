'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createDeal, listDeals, listPipelineStages, listPipelines } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-023–FR-026 · docs/ui-ux/README.md §4 "/deals" screen.
export default function DealsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newStageId, setNewStageId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = session?.role !== 'VIEWER';

  const stageName = useCallback((id: string) => stages.find((s) => s.id === id)?.name ?? id, [stages]);

  const load = useCallback(async (current: Session) => {
    try {
      const [dealsRes, pipelines] = await Promise.all([listDeals(current.accessToken), listPipelines(current.accessToken)]);
      setDeals(dealsRes.data);
      setTotal(dealsRes.meta.total);
      if (pipelines[0]) {
        const stageList = await listPipelineStages(current.accessToken, pipelines[0].id);
        setStages(stageList);
        if (!newStageId && stageList[0]) setNewStageId(stageList[0].id);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    void load(current);
  }, [router, load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      await createDeal(session.accessToken, {
        title: newTitle,
        value: newValue ? Number(newValue) : undefined,
        pipelineStageId: newStageId,
      });
      setNewTitle('');
      setNewValue('');
      setShowNewForm(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create deal.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Deals</h1>
        <div className="flex items-center gap-3">
          <Link href="/pipeline" className="text-sm underline">
            Pipeline board
          </Link>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            >
              + New Deal
            </button>
          )}
          <Link href="/" className="text-sm text-neutral-500 underline">
            Back
          </Link>
        </div>
      </div>

      {canCreate && showNewForm && (
        <form onSubmit={handleCreate} className="flex flex-wrap gap-2 rounded border border-neutral-200 p-4">
          <input
            type="text"
            required
            placeholder="Deal title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-32 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select
            value={newStageId}
            onChange={(e) => setNewStageId(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-2 text-sm"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={isCreating}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {deals === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : deals.length === 0 ? (
        <p className="text-sm text-neutral-500">No deals yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">Title</th>
              <th className="py-2">Stage</th>
              <th className="py-2">Value</th>
              <th className="py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((deal) => (
              <tr key={deal.id} className="border-b border-neutral-100">
                <td className="py-2">
                  <Link href={`/deals/${deal.id}`} className="underline">
                    {deal.title}
                  </Link>
                </td>
                <td className="py-2">{stageName(deal.pipelineStageId)}</td>
                <td className="py-2">{deal.value != null ? `${deal.currency} ${deal.value.toLocaleString()}` : '—'}</td>
                <td className="py-2">{new Date(deal.updatedAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="text-sm text-neutral-500">{total} total</p>
    </main>
  );
}
