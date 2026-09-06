'use client';

import type { AutomationExecution, Deal, Lead } from '@ai-crm/types';
import { Check, Clock, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { ApiRequestError, approveAutomationExecution, getDeal, getLead, listAutomationExecutions, rejectAutomationExecution } from '@/lib/api';
import { readSession, type Session } from '@/lib/session';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Row {
  execution: AutomationExecution;
  lead: Lead | null;
  deal: Deal | null;
}

export default function AutomationApprovalsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async (current: Session) => {
    try {
      const result = await listAutomationExecutions(current.accessToken, { status: 'PENDING_APPROVAL' });
      const enriched = await Promise.all(
        result.data.map(async (execution): Promise<Row> => {
          const lead = execution.leadId ? await getLead(current.accessToken, execution.leadId).catch(() => null) : null;
          const deal = execution.dealId ? await getDeal(current.accessToken, execution.dealId).catch(() => null) : null;
          return { execution, lead, deal };
        }),
      );
      setRows(enriched);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the approval queue.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current);
  }, [load]);

  async function handleApprove(executionId: string) {
    if (!session) return;
    setActingOn(executionId);
    setError(null);
    try {
      await approveAutomationExecution(session.accessToken, executionId);
      setRows((prev) => (prev ? prev.filter((r) => r.execution.id !== executionId) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not approve this action.');
    } finally {
      setActingOn(null);
    }
  }

  async function handleReject(executionId: string) {
    if (!session) return;
    setActingOn(executionId);
    setError(null);
    try {
      await rejectAutomationExecution(session.accessToken, executionId);
      setRows((prev) => (prev ? prev.filter((r) => r.execution.id !== executionId) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reject this action.');
    } finally {
      setActingOn(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={`Pending Approvals${rows ? ` (${rows.length})` : ''}`} description="AI-triggered actions awaiting a human decision." />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {rows === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Check className="size-8 text-success" />
            <p className="text-sm text-muted-foreground">Nothing pending approval right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map(({ execution, lead, deal }) => (
            <Card key={execution.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="size-4 text-warning" />
                  AI-Triggered Action
                </div>
                {lead && (
                  <p className="text-sm text-muted-foreground">
                    Lead:{' '}
                    <Link href={`/leads/${lead.id}`} className="font-medium text-foreground hover:underline">
                      {lead.name}
                    </Link>
                  </p>
                )}
                {deal && (
                  <p className="text-sm text-muted-foreground">
                    Deal:{' '}
                    <Link href={`/deals/${deal.id}`} className="font-medium text-foreground hover:underline">
                      {deal.title}
                    </Link>
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" disabled={actingOn === execution.id} onClick={() => handleApprove(execution.id)}>
                    <Check />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={actingOn === execution.id} onClick={() => handleReject(execution.id)}>
                    <X />
                    Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
