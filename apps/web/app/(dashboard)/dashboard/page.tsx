'use client';

import type { DashboardMetrics, Lead } from '@ai-crm/types';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Briefcase, DollarSign, Target, TrendingUp, Users } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, getDashboardMetrics, listLeads } from '@/lib/api';
import { generateMockDashboardMetrics, generateMockLeads, generateMockTrend } from '@/lib/mock-data';
import { badgeClassName, badgeVariant, formatCurrency, formatDate, LEAD_STATUS_LABEL, LEAD_STATUS_TONE } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

const chartConfig = {
  leads: { label: 'New leads', color: 'hsl(var(--chart-1))' },
  revenue: { label: 'Pipeline added', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

export default function DashboardPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(false);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    Promise.all([getDashboardMetrics(current.accessToken), listLeads(current.accessToken, { page: 1, pageSize: 5 })])
      .then(([metricsRes, leadsRes]) => {
        if (metricsRes.totalLeads === 0) {
          setMetrics(generateMockDashboardMetrics());
          setRecentLeads(generateMockLeads([], [], 5));
          setIsSample(true);
        } else {
          setMetrics(metricsRes);
          setRecentLeads(leadsRes.data);
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load dashboard metrics.'));
  }, []);

  const trend = useMemo(() => generateMockTrend(14), []);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!session || !metrics) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="An overview of your leads, deals, and pipeline health."
        actions={isSample ? <SampleDataBadge /> : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Leads"
          value={metrics.totalLeads.toLocaleString()}
          delta="+12.4%"
          icon={Users}
          href="/leads"
        />
        <StatCard
          label="Qualified Leads"
          value={metrics.qualifiedLeads.toLocaleString()}
          delta="+4.1%"
          icon={Target}
          href="/leads?status=QUALIFIED"
        />
        <StatCard
          label="Open Deals"
          value={metrics.openDeals.toLocaleString()}
          delta="+2"
          icon={Briefcase}
          href="/deals"
        />
        <StatCard
          label="Pipeline Value"
          value={formatCurrency(metrics.pipelineValue)}
          delta="+8.9%"
          icon={DollarSign}
          href="/pipeline"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>New leads trend</CardTitle>
            <CardDescription>New leads added per day over the last 14 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="aspect-auto h-[260px] w-full">
              <AreaChart data={trend} margin={{ left: 0, right: 12, top: 12 }}>
                <defs>
                  <linearGradient id="fillLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-leads)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-leads)" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={(value: string) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                />
                <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Area dataKey="leads" type="monotone" fill="url(#fillLeads)" stroke="var(--color-leads)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Win rate</CardTitle>
            <CardDescription>Won vs. lost deals this quarter</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div>
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Conversion rate</span>
                <span className="text-sm font-medium">{metrics.conversionRate}%</span>
              </div>
              <Progress value={metrics.conversionRate} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-success" />
                <span className="text-sm">Won</span>
              </div>
              <span className="text-sm font-semibold">{metrics.wonDeals}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-destructive" />
                <span className="text-sm">Lost</span>
              </div>
              <span className="text-sm font-semibold">{metrics.lostDeals}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="size-4" />
              <span>Trending up compared to last quarter</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent leads</CardTitle>
            <CardDescription>The latest leads added to your pipeline</CardDescription>
          </div>
          <Link href="/leads" className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            View all
            <ArrowUpRight className="size-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recentLeads === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {isSample ? (
                        lead.name
                      ) : (
                        <Link href={`/leads/${lead.id}`} className="hover:underline">
                          {lead.name}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(LEAD_STATUS_TONE[lead.status])} className={badgeClassName(LEAD_STATUS_TONE[lead.status])}>
                        {LEAD_STATUS_LABEL[lead.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{lead.score ?? '—'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(lead.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
  href,
}: {
  label: string;
  value: string;
  delta: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-muted/40">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription>{label}</CardDescription>
          <Icon className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          <p className="mt-1 flex items-center gap-1 text-xs text-success">
            <TrendingUp className="size-3" />
            {delta} from last month
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
