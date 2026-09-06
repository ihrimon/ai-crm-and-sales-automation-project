'use client';

import type { Lead, LeadStatus, OrganizationMember } from '@ai-crm/types';
import { Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, assignLead, deleteLead, getLead, listMembers, updateLead } from '@/lib/api';
import { readSession, type Session } from '@/lib/session';
import { ActivityTimeline } from '@/components/activity-timeline';
import { AiPanel } from '@/components/ai-panel';
import { TaskList } from '@/components/task-list';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { badgeClassName, badgeVariant, initials, LEAD_STATUS_LABEL, LEAD_STATUS_TONE } from '@/lib/status';

const STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'];

export default function LeadDetailPage() {
  const params = useParams<{ leadId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [assignToId, setAssignToId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const canWrite = session?.role !== 'VIEWER';
  const canDelete = session?.role === 'OWNER' || session?.role === 'ADMIN' || session?.role === 'SALES_MANAGER';
  const canAssign = canDelete;

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    getLead(current.accessToken, params.leadId)
      .then(setLead)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load this lead.'));
    if (current.role === 'OWNER' || current.role === 'ADMIN' || current.role === 'SALES_MANAGER') {
      listMembers(current.accessToken, current.organizationId!, 1, 100)
        .then((res) => setMembers(res.data.filter((m) => m.isActive)))
        .catch(() => undefined);
    }
  }, [params.leadId]);

  async function handleAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !lead || !assignToId) return;
    setIsAssigning(true);
    setError(null);
    try {
      setLead(await assignLead(session.accessToken, lead.id, assignToId));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not assign this lead.');
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !lead) return;
    setIsSaving(true);
    setError(null);
    try {
      const updated = await updateLead(session.accessToken, lead.id, {
        name: lead.name,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        status: lead.status,
      });
      setLead(updated);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!session || !lead) return;
    setIsDeleting(true);
    try {
      await deleteLead(session.accessToken, lead.id);
      router.push('/leads');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete this lead.');
      setIsDeleting(false);
    }
  }

  if (error && !lead) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-12">
          <AvatarFallback>{initials(lead.name)}</AvatarFallback>
        </Avatar>
        <div className="flex flex-1 flex-col">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{lead.name}</h1>
            <Badge variant={badgeVariant(LEAD_STATUS_TONE[lead.status])} className={badgeClassName(LEAD_STATUS_TONE[lead.status])}>
              {LEAD_STATUS_LABEL[lead.status]}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {lead.jobTitle ?? 'Lead'} {lead.source && `· via ${lead.source}`}
          </p>
        </div>
        {canDelete && (
          <Button type="button" variant="outline" size="sm" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 />
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <form onSubmit={handleSave}>
              <CardHeader>
                <CardTitle>Lead details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={lead.name}
                    disabled={!canWrite}
                    onChange={(e) => setLead({ ...lead, name: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={lead.status}
                    disabled={!canWrite}
                    onValueChange={(v) => setLead({ ...lead, status: v as LeadStatus })}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LEAD_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={lead.email ?? ''}
                    disabled={!canWrite}
                    onChange={(e) => setLead({ ...lead, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={lead.phone ?? ''}
                    disabled={!canWrite}
                    onChange={(e) => setLead({ ...lead, phone: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Budget</Label>
                  <Input value={lead.budget != null ? `$${lead.budget.toLocaleString()}` : '—'} disabled />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>AI score</Label>
                  <Input value={lead.score ?? '—'} disabled />
                </div>
              </CardContent>
              {canWrite && (
                <CardFooter>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save changes'}
                  </Button>
                </CardFooter>
              )}
            </form>
          </Card>

          {canAssign && (
            <Card>
              <CardHeader>
                <CardTitle>Ownership</CardTitle>
              </CardHeader>
              <form onSubmit={handleAssign}>
                <CardContent className="flex items-end gap-2">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Label htmlFor="assignToId">Assign to</Label>
                    <Select value={assignToId} onValueChange={setAssignToId}>
                      <SelectTrigger id="assignToId">
                        <SelectValue placeholder="Choose a member…" />
                      </SelectTrigger>
                      <SelectContent>
                        {members.map((member) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.userId} ({member.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" variant="outline" disabled={isAssigning || !assignToId}>
                    {isAssigning ? 'Assigning…' : 'Assign'}
                  </Button>
                </CardContent>
              </form>
            </Card>
          )}
        </div>

        {session && (
          <Card className="lg:col-span-1">
            <CardContent className="pt-6">
              <Tabs defaultValue="ai">
                <TabsList className="w-full">
                  <TabsTrigger value="ai" className="flex-1">
                    AI
                  </TabsTrigger>
                  <TabsTrigger value="activity" className="flex-1">
                    Activity
                  </TabsTrigger>
                  <TabsTrigger value="tasks" className="flex-1">
                    Tasks
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="ai" className="pt-4">
                  <AiPanel session={session} leadId={lead.id} canUse={canWrite} />
                </TabsContent>
                <TabsContent value="activity" className="pt-4">
                  <ActivityTimeline session={session} relation={{ leadId: lead.id }} canLog={canWrite} />
                </TabsContent>
                <TabsContent value="tasks" className="pt-4">
                  <TaskList session={session} relation={{ leadId: lead.id }} canCreate={canWrite} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
