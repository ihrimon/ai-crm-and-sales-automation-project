'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, getDeal, listPipelineStages, listPipelines, moveDeal, updateDeal } from '../../../lib/api';
import { readSession, type Session } from '../../../lib/session';
import { ActivityTimeline } from '../../../components/activity-timeline';
import { TaskList } from '../../../components/task-list';

// FR-024, FR-025, FR-028, FR-030–FR-032 · docs/ui-ux/README.md §4 "/deals/:id"
// screen — properties, plus the same Activity Timeline/Tasks panels Lead
// Detail embeds (docs/ui-ux/README.md §5.3), filtered by dealId instead.
export default function DealDetailPage() {
  const params = useParams<{ dealId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [deal, setDeal] = useState<Deal | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingLostStageId, setPendingLostStageId] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState('');

  const canWrite = session?.role !== 'VIEWER';

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

    Promise.all([getDeal(current.accessToken, params.dealId), listPipelines(current.accessToken)])
      .then(async ([dealResult, pipelines]) => {
        setDeal(dealResult);
        if (pipelines[0]) {
          setStages(await listPipelineStages(current.accessToken, pipelines[0].id));
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this deal.'));
  }, [router, params.dealId]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !deal) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateDeal(session.accessToken, deal.id, {
        title: deal.title,
        value: deal.value ?? undefined,
        probability: deal.probability ?? undefined,
      });
      setDeal(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStageChange(stageId: string) {
    if (!session || !deal) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.isLost) {
      // Dropping into a Lost stage prompts for a reason before the call
      // fires (docs/ui-ux/README.md §5.4) — the API also rejects it
      // server-side either way (M4's key rule).
      setPendingLostStageId(stageId);
      return;
    }
    setError(null);
    try {
      const moved = await moveDeal(session.accessToken, deal.id, { pipelineStageId: stageId });
      setDeal(moved);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not move this deal.');
    }
  }

  async function confirmLostMove() {
    if (!session || !deal || !pendingLostStageId) return;
    setError(null);
    try {
      const moved = await moveDeal(session.accessToken, deal.id, {
        pipelineStageId: pendingLostStageId,
        lostReason,
      });
      setDeal(moved);
      setPendingLostStageId(null);
      setLostReason('');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not move this deal.');
    }
  }

  if (error && !deal) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 p-8">
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
        <Link href="/deals" className="text-sm underline">
          Back to Deals
        </Link>
      </main>
    );
  }

  if (!deal) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg items-center justify-center p-8">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 p-8">
      <Link href="/deals" className="text-sm text-neutral-500 underline">
        ← Deals
      </Link>

      <h1 className="text-2xl font-semibold">{deal.title}</h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            type="text"
            value={deal.title}
            disabled={!canWrite}
            onChange={(e) => setDeal({ ...deal, title: e.target.value })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="value" className="text-sm font-medium">
            Value ({deal.currency})
          </label>
          <input
            id="value"
            type="number"
            value={deal.value ?? ''}
            disabled={!canWrite}
            onChange={(e) => setDeal({ ...deal, value: e.target.value ? Number(e.target.value) : null })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="probability" className="text-sm font-medium">
            Probability (%)
          </label>
          <input
            id="probability"
            type="number"
            min={0}
            max={100}
            value={deal.probability ?? ''}
            disabled={!canWrite}
            onChange={(e) => setDeal({ ...deal, probability: e.target.value ? Number(e.target.value) : null })}
            className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="stage" className="text-sm font-medium">
            Stage
          </label>
          <select
            id="stage"
            value={deal.pipelineStageId}
            disabled={!canWrite}
            onChange={(e) => handleStageChange(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-500"
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        {deal.lostReason && <p className="text-sm text-neutral-500">Lost reason: {deal.lostReason}</p>}

        {pendingLostStageId && (
          <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
            <label htmlFor="lostReason" className="text-sm font-medium">
              Why was this lost?
            </label>
            <input
              id="lostReason"
              type="text"
              required
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmLostMove}
                className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingLostStageId(null);
                  setLostReason('');
                }}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

      {session && (
        <div className="flex flex-col gap-6 border-t border-neutral-200 pt-6">
          <ActivityTimeline session={session} relation={{ dealId: deal.id }} canLog={canWrite} />
          <TaskList session={session} relation={{ dealId: deal.id }} canCreate={canWrite} />
        </div>
      )}
    </main>
  );
}
