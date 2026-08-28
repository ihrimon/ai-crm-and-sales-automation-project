'use client';

import type { Activity, ActivityType } from '@ai-crm/types';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createActivity, listActivities } from '../lib/api';
import type { Session } from '../lib/session';

const ACTIVITY_TYPES: ActivityType[] = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STAGE_CHANGE', 'OTHER'];

type Relation = { leadId: string } | { contactId: string } | { companyId: string } | { dealId: string };

// FR-030 · docs/ui-ux/README.md §5.3 "ACTIVITY TIMELINE" panel, shared by
// Lead Detail and Deal Detail (both embed it against their own record).
export function ActivityTimeline({ session, relation, canLog }: { session: Session; relation: Relation; canLog: boolean }) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ActivityType>('NOTE');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Depend on the relation's id value, not the object reference — a fresh
  // `{ leadId: lead.id }` literal on every parent render would otherwise
  // re-fetch on every keystroke in the parent's edit form.
  const relationId = Object.values(relation)[0];

  useEffect(() => {
    listActivities(session.accessToken, { ...relation, pageSize: 50 })
      .then((res) => setActivities(res.data))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load activities.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, relationId]);

  async function handleLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const created = await createActivity(session.accessToken, { type, notes: notes || undefined, ...relation });
      setActivities((prev) => [created, ...(prev ?? [])]);
      setNotes('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not log this activity.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Activity Timeline</h2>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {activities === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : activities.length === 0 ? (
        <p className="text-sm text-neutral-500">No activity logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {activities.map((activity) => (
            <li key={activity.id} className="flex items-baseline gap-2">
              <span aria-hidden>●</span>
              <span className="font-medium">{activity.type}</span>
              {activity.notes && <span className="text-neutral-500">— {activity.notes}</span>}
              <span className="ml-auto text-neutral-400">{new Date(activity.occurredAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}

      {canLog && (
        <>
          <button type="button" onClick={() => setShowForm((v) => !v)} className="self-start text-sm underline">
            + Log Activity
          </button>
          {showForm && (
            <form onSubmit={handleLog} className="flex flex-col gap-2 rounded border border-neutral-200 p-3">
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                className="rounded border border-neutral-300 px-2 py-2 text-sm"
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
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
