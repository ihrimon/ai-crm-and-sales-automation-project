'use client';

import type { Deal, PipelineStage } from '@ai-crm/types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, createDeal, listDeals, listPipelineStages, listPipelines } from '@/lib/api';
import { generateMockCompanies, generateMockDeals, generateMockPipelineStages } from '@/lib/mock-data';
import { badgeClassName, badgeVariant, dealStageTone, formatCurrency, formatDate } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

export default function DealsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [isSample, setIsSample] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newStageId, setNewStageId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = session?.role !== 'VIEWER';

  const stageFor = useCallback((id: string) => stages.find((s) => s.id === id), [stages]);

  const load = useCallback(async (current: Session) => {
    try {
      const [dealsRes, pipelines] = await Promise.all([listDeals(current.accessToken), listPipelines(current.accessToken)]);
      let stageList: PipelineStage[] = [];
      if (pipelines[0]) {
        stageList = await listPipelineStages(current.accessToken, pipelines[0].id);
      }

      if (dealsRes.data.length === 0) {
        const mockStages = stageList.length ? stageList : generateMockPipelineStages();
        const companies = generateMockCompanies(6);
        setStages(mockStages);
        setDeals(generateMockDeals(mockStages, companies, 16));
        setTotal(16);
        setIsSample(true);
      } else {
        setStages(stageList);
        setDeals(dealsRes.data);
        setTotal(dealsRes.meta.total);
        setIsSample(false);
      }
      if (!newStageId && stageList[0]) setNewStageId(stageList[0].id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load deals.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current);
  }, [load]);

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
      setDialogOpen(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create deal.');
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deals"
        description="Every open, won, and lost deal across your pipeline."
        actions={
          <>
            {isSample && <SampleDataBadge />}
            <Button variant="outline" size="sm" asChild>
              <Link href="/pipeline">Pipeline board</Link>
            </Button>
            {canCreate && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus />
                    New Deal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader>
                      <DialogTitle>Create a new deal</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="newTitle">Title</Label>
                        <Input id="newTitle" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="newValue">Value</Label>
                        <Input id="newValue" type="number" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="newStageId">Stage</Label>
                        <Select value={newStageId} onValueChange={setNewStageId}>
                          <SelectTrigger id="newStageId">
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
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? 'Creating…' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {deals === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : deals.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No deals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((deal) => {
                  const stage = stageFor(deal.pipelineStageId);
                  return (
                    <TableRow key={deal.id}>
                      <TableCell className="font-medium">
                        {isSample ? (
                          deal.title
                        ) : (
                          <Link href={`/deals/${deal.id}`} className="hover:underline">
                            {deal.title}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant(dealStageTone(stage))} className={badgeClassName(dealStageTone(stage))}>
                          {stage?.name ?? deal.pipelineStageId}
                        </Badge>
                      </TableCell>
                      <TableCell>{deal.value != null ? formatCurrency(deal.value, deal.currency) : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatDate(deal.updatedAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{total} total</p>
    </div>
  );
}
