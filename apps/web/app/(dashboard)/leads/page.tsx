'use client';

import type { Lead, LeadStatus } from '@ai-crm/types';
import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Plus, Search } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, createLead, listLeads } from '@/lib/api';
import { generateMockCompanies, generateMockContacts, generateMockLeads } from '@/lib/mock-data';
import { badgeClassName, badgeVariant, formatDate, LEAD_STATUS_LABEL, LEAD_STATUS_TONE } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];

export default function LeadsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const pageSize = 20;
  const canCreate = session?.role !== 'VIEWER';

  const load = useCallback(async (current: Session, currentPage: number, currentSearch: string, currentStatus: string) => {
    try {
      const result = await listLeads(current.accessToken, {
        page: currentPage,
        pageSize,
        search: currentSearch || undefined,
        status: currentStatus === 'all' ? undefined : currentStatus,
      });
      if (result.data.length === 0 && result.meta.total === 0 && currentPage === 1 && !currentSearch && currentStatus === 'all') {
        const companies = generateMockCompanies(6);
        const contacts = generateMockContacts(companies, 10);
        setLeads(generateMockLeads(companies, contacts, 18));
        setTotal(18);
        setIsSample(true);
      } else {
        setLeads(result.data);
        setTotal(result.meta.total);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load leads.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current, page, search, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPage(1);
    await load(session, 1, search, status);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      await createLead(session.accessToken, { name: newName });
      setNewName('');
      setDialogOpen(false);
      await load(session, page, search, status);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create lead.');
    } finally {
      setIsCreating(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leads"
        description="Track and qualify inbound and outbound leads."
        actions={
          <>
            {isSample && <SampleDataBadge />}
            {canCreate && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus />
                    New Lead
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader>
                      <DialogTitle>Create a new lead</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 py-4">
                      <Label htmlFor="newName">Lead name</Label>
                      <Input id="newName" required value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
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

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAD_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {leads === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : leads.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {search || status !== 'all' ? 'No leads match these filters.' : 'No leads yet — create your first one above.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      {isSample ? (
                        lead.name
                      ) : (
                        <Link href={`/leads/${lead.id}`} className="hover:underline">
                          {lead.name}
                        </Link>
                      )}
                      {lead.email && <p className="text-xs font-normal text-muted-foreground">{lead.email}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badgeVariant(LEAD_STATUS_TONE[lead.status])} className={badgeClassName(LEAD_STATUS_TONE[lead.status])}>
                        {LEAD_STATUS_LABEL[lead.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.source ?? '—'}</TableCell>
                    <TableCell>{lead.score ?? '—'}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatDate(lead.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {leads && leads.length > 0 && !isSample && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages} — {total} total
          </span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
