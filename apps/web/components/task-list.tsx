'use client';

import type { Task, TaskStatus } from '@ai-crm/types';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createTask, listTasks, updateTask } from '../lib/api';
import type { Session } from '../lib/session';

const STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

type Relation = { leadId: string } | { contactId: string } | { companyId: string } | { dealId: string };

// FR-031–FR-032 · docs/ui-ux/README.md §5.3 "TASKS" panel, shared by Lead
// Detail and Deal Detail (both embed it against their own record).
export function TaskList({ session, relation, canCreate }: { session: Session; relation: Relation; canCreate: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Depend on the relation's id value, not the object reference — see
  // ActivityTimeline for why (a fresh literal on every parent render would
  // otherwise re-fetch on every keystroke in the parent's edit form).
  const relationId = Object.values(relation)[0];

  useEffect(() => {
    listTasks(session.accessToken, { ...relation, pageSize: 50 })
      .then((res) => setTasks(res.data))
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
      setTasks((prev) => [...(prev ?? []), created]);
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
    setError(null);
    try {
      const updated = await updateTask(session.accessToken, task.id, { status: newStatus });
      setTasks((prev) => (prev ? prev.map((t) => (t.id === updated.id ? updated : t)) : prev));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update this task.');
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Tasks</h2>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {tasks === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-neutral-500">No tasks yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-2">
              <span>{task.title}</span>
              {task.dueDate && <span className="text-neutral-400">— due {new Date(task.dueDate).toLocaleDateString()}</span>}
              <select
                value={task.status}
                onChange={(e) => handleStatusChange(task, e.target.value as TaskStatus)}
                className="ml-auto rounded border border-neutral-300 px-2 py-1 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="self-start text-sm underline">
            + New Task
          </button>
          {showForm && (
            <form onSubmit={handleCreate} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
              <input
                type="text"
                required
                placeholder="Task title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded border border-neutral-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={isSaving}
                className="self-start rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
