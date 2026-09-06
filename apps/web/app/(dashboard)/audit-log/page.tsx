'use client';

import type { AuditLog } from '@ai-crm/types';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, listAuditLogs } from '@/lib/api';
import { generateMockAuditLogs } from '@/lib/mock-data';
import { formatDateTime } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

export default function AuditLogPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (current: Session, filters: { entityType: string; entityId: string }) => {
    try {
      const result = await listAuditLogs(current.accessToken, {
        pageSize: 50,
        entityType: filters.entityType || undefined,
        entityId: filters.entityId || undefined,
      });
      if (result.data.length === 0 && !filters.entityType && !filters.entityId) {
        setLogs(generateMockAuditLogs(12));
        setIsSample(true);
      } else {
        setLogs(result.data);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load audit logs.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current, { entityType: '', entityId: '' });
  }, [load]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    await load(session, { entityType, entityId });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit Log"
        description="Every create, update, and delete across your organization."
        actions={isSample ? <SampleDataBadge /> : undefined}
      />

      <form onSubmit={handleFilterSubmit} className="flex flex-wrap gap-2">
        <Input placeholder="Entity type (e.g. Lead)" value={entityType} onChange={(e) => setEntityType(e.target.value)} className="w-48" />
        <Input placeholder="Entity id" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="w-48" />
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
          {logs === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No audit log entries match this filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
                    <TableCell>
                      {log.entityType} <span className="text-muted-foreground">{log.entityId.slice(0, 12)}…</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.action === 'DELETE' ? 'destructive' : log.action === 'CREATE' ? 'default' : 'secondary'}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{log.actorUserId?.slice(0, 12) ?? '—'}</TableCell>
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
