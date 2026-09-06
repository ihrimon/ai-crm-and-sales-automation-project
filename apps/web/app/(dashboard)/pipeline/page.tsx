'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, listDeals, listPipelineStages, listPipelines, moveDeal } from '@/lib/api';
import { generateMockCompanies, generateMockDeals, generateMockPipelineStages } from '@/lib/mock-data';
import { formatCurrency } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

export default function PipelinePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ dealId: string; stageId: string } | null>(null);
  const [lostReason, setLostReason] = useState('');

  const canMove = session?.role !== 'VIEWER';

  const load = useCallback(async (current: Session) => {
    try {
      const pipelines = await listPipelines(current.accessToken);
      let stageList: PipelineStage[] = [];
      if (pipelines[0]) {
        stageList = await listPipelineStages(current.accessToken, pipelines[0].id);
      }
      const dealsRes = pipelines[0] ? await listDeals(current.accessToken, { pageSize: 100 }) : { data: [], meta: { page: 1, pageSize: 100, total: 0 } };

      if (dealsRes.data.length === 0) {
        const mockStages = stageList.length ? stageList : generateMockPipelineStages();
        const companies = generateMockCompanies(6);
        setStages(mockStages);
        setDeals(generateMockDeals(mockStages, companies, 16));
        setIsSample(true);
      } else {
        setStages(stageList);
        setDeals(dealsRes.data);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the pipeline.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current);
  }, [load]);

  async function handleMove(dealId: string, stageId: string) {
    if (!session || isSample) return;
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
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pipeline"
        description="Move deals through your sales stages."
        actions={
          <>
            {isSample && <SampleDataBadge />}
            <Button variant="outline" size="sm" asChild>
              <Link href="/deals">Deal list</Link>
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {pendingMove && (
        <Card className="border-destructive/50 sm:w-96">
          <CardHeader className="pb-2 text-sm font-medium">Why was this lost?</CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Input required value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmLostMove}>
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPendingMove(null);
                  setLostReason('');
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {deals === null ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {stages.map((stage) => {
            const stageDeals = deals.filter((deal) => deal.pipelineStageId === stage.id);
            const stageValue = stageDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);
            return (
              <div key={stage.id} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold">
                    {stage.name} <span className="text-muted-foreground">({stageDeals.length})</span>
                  </h2>
                  <span className="text-xs text-muted-foreground">{formatCurrency(stageValue)}</span>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-2">
                  {stageDeals.map((deal) => (
                    <Card key={deal.id} className="shadow-none">
                      <CardContent className="flex flex-col gap-2 p-3">
                        {isSample ? (
                          <span className="text-sm font-medium">{deal.title}</span>
                        ) : (
                          <Link href={`/deals/${deal.id}`} className="text-sm font-medium hover:underline">
                            {deal.title}
                          </Link>
                        )}
                        {deal.value != null && (
                          <p className="text-sm text-muted-foreground">{formatCurrency(deal.value, deal.currency)}</p>
                        )}
                        {canMove && !isSample && (
                          <Select value={deal.pipelineStageId} onValueChange={(v) => handleMove(deal.id, v)}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {stages.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {stageDeals.length === 0 && <p className="p-3 text-xs text-muted-foreground">No deals</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
