'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, listDeals, listPipelineStages, listPipelines, moveDeal } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-027, FR-028 · docs/ui-ux/README.md §5.4 "/pipeline" Kanban wireframe.
// Simplified to a per-card "move to" select rather than drag-and-drop
// (functional and clean first, per docs/ui-ux/README.md §2's design
// principles) — dropping into an isLost stage still prompts for a reason
// before the call fires, same as the wireframe describes for drag-and-drop.
export default function PipelinePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState('');

  const canMove = session?.role !== 'VIEWER';

  const load = useCallback(async (current: Session) => {
    try {
      const pipelines = await listPipelines(current.accessToken);
      if (!pipelines[0]) return;
      const [stageList, dealsRes] = await Promise.all([
        listPipelineStages(current.accessToken, pipelines[0].id),
        listDeals(current.accessToken, { pageSize: 100 }),
      ]);
      setStages(stageList);
      setDeals(dealsRes.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the pipeline.');
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
    void load(current);
  }, [router, load]);

  async function handleMove(dealId: string, stageId: string) {
    if (!session) return;
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.isLost) {
      setPendingMove({ dealId, stageId });
      return;
    }
    setError(null);
    try {
      await moveDeal(session.accessToken, dealId, { pipelineStageId: stageId });
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not move this deal.');
    }
  }

  async function confirmLostMove() {
    if (!session || !pendingMove) return;
    setError(null);
    try {
      await moveDeal(session.accessToken, pendingMove.dealId, {
        pipelineStageId: pendingMove.stageId,
        lostReason,
      });
      setPendingMove(null);
      setLostReason('');
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not move this deal.');
    }
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <div className="flex items-center gap-3">
          <Link href="/deals" className="text-sm underline">
            Deal list
          </Link>
          <Link href="/" className="text-sm text-neutral-500 underline">
            Back
          </Link>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {pendingMove && (
        <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3 sm:w-96">
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
            <button type="button" onClick={confirmLostMove} className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white">
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingMove(null);
                setLostReason('');
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((deal) => deal.pipelineStageId === stage.id);
          return (
            <div key={stage.id} className="w-64 flex-shrink-0 rounded border border-neutral-200">
              <div className="border-b border-neutral-200 p-3">
                <h2 className="text-sm font-semibold">
                  {stage.name} ({stageDeals.length})
                </h2>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {stageDeals.map((deal) => (
                  <div key={deal.id} className="rounded border border-neutral-200 p-2 text-sm">
                    <Link href={`/deals/${deal.id}`} className="font-medium underline">
                      {deal.title}
                    </Link>
                    {deal.value != null && <p className="text-neutral-500">{deal.currency} {deal.value.toLocaleString()}</p>}
                    {canMove && (
                      <select
                        aria-label={`Move ${deal.title}`}
                        value={deal.pipelineStageId}
                        onChange={(e) => handleMove(deal.id, e.target.value)}
                        className="mt-1 w-full rounded border border-neutral-300 px-1 py-1 text-xs"
                      >
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
                {stageDeals.length === 0 && <p className="p-2 text-xs text-neutral-400">No deals</p>}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
