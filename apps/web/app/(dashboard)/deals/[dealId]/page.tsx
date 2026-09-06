'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, getDeal, listPipelineStages, listPipelines, moveDeal, updateDeal } from '@/lib/api';
import { readSession, type Session } from '@/lib/session';
import { ActivityTimeline } from '@/components/activity-timeline';
import { TaskList } from '@/components/task-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { badgeClassName, badgeVariant, dealStageTone, formatCurrency } from '@/lib/status';

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
  const currentStage = stages.find((s) => s.id === deal?.pipelineStageId);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);

    Promise.all([getDeal(current.accessToken, params.dealId), listPipelines(current.accessToken)])
      .then(async ([dealResult, pipelines]) => {
        setDeal(dealResult);
        if (pipelines[0]) {
          setStages(await listPipelineStages(current.accessToken, pipelines[0].id));
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this deal.'));
  }, [params.dealId]);

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
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!deal) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{deal.title}</h1>
            <Badge variant={badgeVariant(dealStageTone(currentStage))} className={badgeClassName(dealStageTone(currentStage))}>
              {currentStage?.name ?? deal.pipelineStageId}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {deal.value != null ? formatCurrency(deal.value, deal.currency) : 'No value set'}
            {deal.probability != null && ` · ${deal.probability}% probability`}
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <form onSubmit={handleSave}>
              <CardHeader>
                <CardTitle>Deal details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={deal.title}
                    disabled={!canWrite}
                    onChange={(e) => setDeal({ ...deal, title: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="value">Value ({deal.currency})</Label>
                  <Input
                    id="value"
                    type="number"
                    value={deal.value ?? ''}
                    disabled={!canWrite}
                    onChange={(e) => setDeal({ ...deal, value: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="probability">Probability (%)</Label>
                  <Input
                    id="probability"
                    type="number"
                    min={0}
                    max={100}
                    value={deal.probability ?? ''}
                    disabled={!canWrite}
                    onChange={(e) => setDeal({ ...deal, probability: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label htmlFor="stage">Stage</Label>
                  <Select value={deal.pipelineStageId} disabled={!canWrite} onValueChange={handleStageChange}>
                    <SelectTrigger id="stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {deal.lostReason && (
                  <p className="text-sm text-muted-foreground sm:col-span-2">Lost reason: {deal.lostReason}</p>
                )}
              </CardContent>
              {canWrite && (
                <CardFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </CardFooter>
              )}
            </form>
          </Card>

          {pendingLostStageId && (
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-base">Why was this lost?</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Input required value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder="Reason" />
                <div className="flex gap-2">
                  <Button type="button" onClick={confirmLostMove}>
                    Confirm
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingLostStageId(null);
                      setLostReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {session && (
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <Tabs defaultValue="activity">
                <TabsList className="w-full">
                  <TabsTrigger value="activity" className="flex-1">
                    Activity
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="flex-1">
                    Tasks
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="activity" className="pt-4">
                  <ActivityTimeline session={session} relation={{ dealId: deal.id }} canLog={canWrite} />
                </TabsContent>
                <TabsContent value="tasks" className="pt-4">
                  <TaskList session={session} relation={{ dealId: deal.id }} canCreate={canWrite} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
