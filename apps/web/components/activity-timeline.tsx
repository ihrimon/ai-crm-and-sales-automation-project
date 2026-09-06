'use client';

import type { Activity, ActivityType } from '@ai-crm/types';
import { Phone, Mail, Users as UsersIcon, StickyNote, ArrowRightLeft, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createActivity, listActivities } from '../lib/api';
import { generateMockActivities } from '../lib/mock-data';
import { formatDateTime } from '../lib/status';
import type { Session } from '../lib/session';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Skeleton } from './ui/skeleton';

const ACTIVITY_TYPES: ActivityType[] = ['CALL', 'EMAIL', 'MEETING', 'NOTE', 'STAGE_CHANGE', 'OTHER'];

const ACTIVITY_ICON: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: UsersIcon,
  NOTE: StickyNote,
  STAGE_CHANGE: ArrowRightLeft,
  OTHER: MoreHorizontal,
};

type Relation = { leadId: string } | { contactId: string } | { companyId: string } | { dealId: string };

// FR-030 · docs/ui-ux/README.md §5.3 "ACTIVITY TIMELINE" panel, shared by
// Lead Detail and Deal Detail (both embed it against their own record).
export function ActivityTimeline({ session, relation, canLog }: { session: Session; relation: Relation; canLog: boolean }) {
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<ActivityType>('NOTE');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const relationId = Object.values(relation)[0];

  useEffect(() => {
    listActivities(session.accessToken, { ...relation, pageSize: 50 })
      .then((res) => {
        if (res.data.length === 0) {
          setActivities(generateMockActivities(4));
          setIsSample(true);
        } else {
          setActivities(res.data);
          setIsSample(false);
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load activities.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accessToken, relationId]);

  async function handleLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      const created = await createActivity(session.accessToken, { type, notes: notes || undefined, ...relation });
      setActivities((prev) => [created, ...(isSample ? [] : (prev ?? []))]);
      setIsSample(false);
      setNotes('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not log this activity.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {activities === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : activities.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {activities.map((activity) => {
            const Icon = ACTIVITY_ICON[activity.type];
            return (
              <li key={activity.id} className="flex gap-3">
                <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted">
                  <Icon className="size-3.5 text-muted-foreground" />
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{activity.type.replaceAll('_', ' ')}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(activity.occurredAt)}</span>
                  </div>
                  {activity.notes && <p className="text-sm text-muted-foreground">{activity.notes}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canLog && (
        <>
          {!showForm && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setShowForm(true)}>
              <Plus />
              Log activity
            </Button>
          )}
          {showForm && (
            <form onSubmit={handleLog} className="flex flex-col gap-2 rounded-lg border p-3">
              <Select value={type} onValueChange={(v) => setType(v as ActivityType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t.replaceAll('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
