'use client';

import type { OrganizationMember, OrgRole } from '@ai-crm/types';
import { Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, inviteMember, listMembers, removeMember, updateMember } from '@/lib/api';
import { initials, ROLE_LABEL } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP', 'VIEWER'];

export default function TeamPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [members, setMembers] = useState<OrganizationMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('SALES_REP');
  const [isInviting, setIsInviting] = useState(false);

  const canManage = session?.role === 'OWNER' || session?.role === 'ADMIN';

  const loadMembers = useCallback(async (current: Session) => {
    try {
      const result = await listMembers(current.accessToken, current.organizationId!);
      setMembers(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load the team.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void loadMembers(current);
  }, [loadMembers]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    setIsInviting(true);
    try {
      await inviteMember(session.accessToken, session.organizationId!, { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      await loadMembers(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not invite that person.');
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: OrgRole) {
    if (!session) return;
    setError(null);
    try {
      await updateMember(session.accessToken, session.organizationId!, memberId, { role });
      await loadMembers(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update that member.');
    }
  }

  async function handleRemove(memberId: string) {
    if (!session) return;
    setError(null);
    try {
      await removeMember(session.accessToken, session.organizationId!, memberId);
      await loadMembers(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not remove that member.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team" description="Everyone with access to this organization." />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {members === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No members yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Active</TableHead>
                  {canManage && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">{initials(member.userId)}</AvatarFallback>
                        </Avatar>
                        {member.userId}
                      </div>
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <Select value={member.role} onValueChange={(v) => handleRoleChange(member.id, v as OrgRole)}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABEL[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary">{ROLE_LABEL[member.role]}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={member.isActive ? 'default' : 'outline'}>{member.isActive ? 'Active' : 'Inactive'}</Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleRemove(member.id)}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <Card>
          <form onSubmit={handleInvite}>
            <CardHeader>
              <CardTitle className="text-base">Invite a team member</CardTitle>
              <CardDescription>They need an existing account — invite only attaches one, it doesn&apos;t send an email yet.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Input
                type="email"
                required
                placeholder="email@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 min-w-56"
              />
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.filter((role) => role !== 'OWNER').map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isInviting}>
                <UserPlus />
                {isInviting ? 'Inviting…' : 'Invite'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  );
}
