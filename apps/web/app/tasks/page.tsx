'use client';

import type { Task, TaskStatus } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, listTasks, updateTask } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

// FR-031–FR-032 · docs/ui-ux/README.md §3 "/tasks" screen: `GET /tasks`,
// `PATCH /tasks/:id` only — creating a task happens from Lead/Deal Detail's
// "+ New Task" (docs/ui-ux/README.md §5.3), not from this screen.
export default function TasksPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;

  const load = useCallback(async (current: Session, currentPage: number, currentStatus: string) => {
    try {
      const result = await listTasks(current.accessToken, {
        page: currentPage,
        pageSize,
        status: (currentStatus || undefined) as TaskStatus | undefined,
      });
      setTasks(result.data);
      setTotal(result.meta.total);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load tasks.');
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
    void load(current, page, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, page]);

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setPage(1);
    await load(session, 1, status);
  }

  async function handleStatusChange(task: Task, newStatus: TaskStatus) {
    if (!session) return;
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
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      <form onSubmit={handleFilterSubmit} className="flex gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-neutral-300 px-2 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium">
          Filter
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {tasks === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {status ? 'No tasks match this filter.' : 'No tasks yet — create one from a lead or deal.'}
        </p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">Title</th>
              <th className="py-2">Due</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-b border-neutral-100">
                <td className="py-2">{task.title}</td>
                <td className="py-2">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}</td>
                <td className="py-2">
                  <select
                    value={task.status}
                    onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                    className="rounded border border-neutral-300 px-2 py-1 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-neutral-500">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="underline disabled:no-underline disabled:opacity-40"
        >
          ‹ Prev
        </button>
        <span>
          Page {page} of {totalPages} — {total} total
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="underline disabled:no-underline disabled:opacity-40"
        >
          Next ›
        </button>
      </div>
    </main>
  );
}
