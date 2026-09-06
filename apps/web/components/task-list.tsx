'use client';

import type { Task, TaskStatus } from '@ai-crm/types';
import { Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createTask, listTasks, updateTask } from '../lib/api';
import { generateMockTasks } from '../lib/mock-data';
import { badgeClassName, badgeVariant, formatDate, TASK_STATUS_LABEL, TASK_STATUS_TONE } from '../lib/status';
import type { Session } from '../lib/session';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Skeleton } from './ui/skeleton';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

type Relation = { leadId: string } | { contactId: string } | { companyId: string } | { dealId: string };

// FR-031–FR-032 · docs/ui-ux/README.md §5.3 "TASKS" panel, shared by Lead
// Detail and Deal Detail (both embed it against their own record).
export function TaskList({ session, relation, canCreate }: { session: Session; relation: Relation; canCreate: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const relationId = Object.values(relation)[0];

  useEffect(() => {
    listTasks(session.accessToken, { ...relation, pageSize: 50 })
      .then((res) => {
        if (res.data.length === 0) {
          setTasks(generateMockTasks(3));
          setIsSample(true);
        } else {
          setTasks(res.data);
          setIsSample(false);
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load tasks.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, relationId]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const created = await createTask(session.accessToken, {
        title,
        dueDate: dueDate || undefined,
        ...relation,
      });
      setTasks((prev) => [...(isSample ? [] : (prev ?? [])), created]);
      setIsSample(false);
      setTitle('');
      setDueDate('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create this task.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(task: Task, newStatus: TaskStatus) {
    if (isSample) return;
    setError(null);
    try {
      const updated = await updateTask(session.accessToken, task.id, { status: newStatus });
      setTasks((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this task.');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {tasks === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2 rounded-lg border p-2">
              <div className="flex flex-1 flex-col">
                <span className="text-sm">{task.title}</span>
                {task.dueDate && <span className="text-xs text-muted-foreground">Due {formatDate(task.dueDate)}</span>}
              </div>
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
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <>
          {!showForm && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setShowForm(true)}>
              <Plus />
              New task
            </Button>
          )}
          {showForm && (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded-lg border p-3">
              <Input required placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
