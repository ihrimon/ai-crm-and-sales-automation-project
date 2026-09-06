'use client';

import type { Task, TaskStatus } from '@ai-crm/types';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, listTasks, updateTask } from '@/lib/api';
import { generateMockTasks } from '@/lib/mock-data';
import { badgeClassName, badgeVariant, formatDate, TASK_STATUS_LABEL, TASK_STATUS_TONE } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

export default function TasksPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;

  const load = useCallback(async (current: Session, currentPage: number, currentStatus: string) => {
    try {
      const result = await listTasks(current.accessToken, {
        page: currentPage,
        pageSize,
        status: currentStatus === 'all' ? undefined : (currentStatus as TaskStatus),
      });
      if (result.data.length === 0 && result.meta.total === 0 && currentPage === 1 && currentStatus === 'all') {
        setTasks(generateMockTasks(10));
        setTotal(10);
        setIsSample(true);
      } else {
        setTasks(result.data);
        setTotal(result.meta.total);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load tasks.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current, page, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function handleStatusFilterChange(value: string) {
    setStatus(value);
    if (!session) return;
    setPage(1);
    await load(session, 1, value);
  }

  async function handleStatusChange(task: Task, newStatus: TaskStatus) {
    if (!session || isSample) return;
    setError(null);
    try {
      const updated = await updateTask(session.accessToken, task.id, { status: newStatus });
      setTasks((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this task.');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Follow-ups and to-dos across your leads and deals."
        actions={isSample ? <SampleDataBadge /> : undefined}
      />

      <Select value={status} onValueChange={handleStatusFilterChange}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {tasks === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {status !== 'all' ? 'No tasks match this filter.' : 'No tasks yet — create one from a lead or deal.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(task.dueDate)}</TableCell>
                    <TableCell>
                      <Select value={task.status} onValueChange={(v) => handleStatusChange(task, v as TaskStatus)}>
                        <SelectTrigger className="h-7 w-auto gap-1 border-none px-2 shadow-none">
                          <Badge variant={badgeVariant(TASK_STATUS_TONE[task.status])} className={badgeClassName(TASK_STATUS_TONE[task.status])}>
                            <SelectValue>{TASK_STATUS_LABEL[task.status]}</SelectValue>
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {TASK_STATUS_LABEL[s]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {tasks && tasks.length > 0 && !isSample && (
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
