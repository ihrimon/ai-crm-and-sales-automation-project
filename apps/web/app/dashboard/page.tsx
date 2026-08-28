'use client';

import type { DashboardMetrics } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiRequestError, getDashboardMetrics } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-033–FR-035 · docs/ui-ux/README.md §5.1 "/dashboard" wireframe. Reads
// across Leads/Deals through GET /dashboard/metrics (no raw SQL from the
// client). AC-021's empty-state clause (NFR-030): a zero-lead organization
// gets a clear CTA instead of a wall of zeroed cards.
export default function DashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    getDashboardMetrics(current.accessToken)
      .then(setMetrics)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load dashboard metrics.'));
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!session || (!metrics && !error) ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : metrics ? (
        <>
          {metrics.totalLeads === 0 && (
            <div className="rounded border border-neutral-200 p-4 text-sm text-neutral-600">
              No leads yet —{' '}
              <Link href="/leads" className="font-medium underline">
                Add your first lead
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard label="Total Leads" value={metrics.totalLeads} />
            <MetricCard label="Qualified" value={metrics.qualifiedLeads} />
            <MetricCard label="Open Deals" value={metrics.openDeals} />
            <MetricCard label="Pipeline $" value={`$${metrics.pipelineValue.toLocaleString()}`} />
          </div>

          <div className="flex flex-wrap gap-6 text-sm text-neutral-600">
            <span>Conversion Rate: {metrics.conversionRate}%</span>
            <span>
              Won / Lost: {metrics.wonDeals} / {metrics.lostDeals}
            </span>
          </div>
        </>
      ) : null}
    </main>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-200 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}
