'use client';

import type { AutomationExecution, Deal, Lead } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError, approveAutomationExecution, getDeal, getLead, listAutomationExecutions, rejectAutomationExecution } from '../../../lib/api';
import { readSession, type Session } from '../../../lib/session';

interface Row {
  execution: AutomationExecution;
  lead: Lead | null;
  deal: Deal | null;
}

// FR-052 🔎 · docs/ui-ux/README.md §5.5 "Automation Approval Queue" wireframe.
// Only ever lists AutomationExecution rows with status=PENDING_APPROVAL —
// plain rule-based executions never appear here (they execute immediately).
export default function AutomationApprovalsPage() {
  const router = useRouter();
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pending Approvals {rows ? `(${rows.length})` : ''}</h1>
        <Link href="/automations" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {rows === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-neutral-500">Nothing pending approval right now.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ execution, lead, deal }) => (
            <li key={execution.id} className="flex flex-col gap-2 rounded border border-neutral-200 p-4">
              <p className="text-sm">
                <span aria-hidden>⏳</span> <span className="font-medium">AI-Triggered Action</span>
              </p>
              {lead && (
                <p className="text-sm text-neutral-600">
                  Lead:{' '}
                  <Link href={`/leads/${lead.id}`} className="underline">
                    {lead.name}
                  </Link>
                </p>
              )}
              {deal && (
                <p className="text-sm text-neutral-600">
                  Deal:{' '}
                  <Link href={`/deals/${deal.id}`} className="underline">
                    {deal.title}
                  </Link>
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={actingOn === execution.id}
                  onClick={() => handleApprove(execution.id)}
                  className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={actingOn === execution.id}
                  onClick={() => handleReject(execution.id)}
                  className="rounded border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
