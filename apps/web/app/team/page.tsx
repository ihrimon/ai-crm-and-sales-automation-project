'use client';

import type { OrganizationMember, OrgRole } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, inviteMember, listMembers, removeMember, updateMember } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

const ROLES: OrgRole[] = ['OWNER', 'ADMIN', 'SALES_MANAGER', 'SALES_REP', 'VIEWER'];

// FR-007, FR-008, FR-010–FR-012 · docs/ui-ux/README.md §4 "/team" screen
// ("OWNER, ADMIN (view: all)" — everyone sees the list, only OWNER/ADMIN get
// the invite/edit/remove controls, matching the API's x-roles).
export default function TeamPage() {
  const router = useRouter();
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
    if (!current) {
      router.replace('/login');
      return;
    }
    if (!current.organizationId) {
      router.replace('/onboarding');
      return;
    }
    setSession(current);
    void loadMembers(current);
  }, [router, loadMembers]);

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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Team</h1>
        <Link href="/" className="text-sm text-neutral-500 underline">
          Back
        </Link>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {members === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-neutral-500">No members yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">User</th>
              <th className="py-2">Role</th>
              <th className="py-2">Active</th>
              {canManage && <th className="py-2">{''}</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.id} className="border-b border-neutral-100">
                <td className="py-2">{member.userId}</td>
                <td className="py-2">
                  {canManage ? (
                    <select
                      aria-label={`Role for member ${member.id}`}
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.id, e.target.value as OrgRole)}
                      className="rounded border border-neutral-300 px-2 py-1 text-sm"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                  ) : (
                    member.role
                  )}
                </td>
                <td className="py-2">{member.isActive ? 'Yes' : 'No'}</td>
                {canManage && (
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => handleRemove(member.id)}
                      className="text-sm text-red-600 underline"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canManage && (
        <form onSubmit={handleInvite} className="flex flex-col gap-3 rounded border border-neutral-200 p-4">
          <h2 className="text-sm font-medium">Invite a team member</h2>
          <p className="text-xs text-neutral-500">They need an existing account — invite only attaches one, it doesn&apos;t send an email yet.</p>
          <div className="flex gap-2">
            <input
              type="email"
              required
              placeholder="email@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              className="rounded border border-neutral-300 px-2 py-2 text-sm"
            >
              {ROLES.filter((role) => role !== 'OWNER').map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={isInviting}
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {isInviting ? 'Inviting…' : 'Invite'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
