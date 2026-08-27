'use client';

import type { Contact } from '@ai-crm/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createContact, deleteContact, listContacts } from '../../lib/api';
import { readSession, type Session } from '../../lib/session';

// FR-019–FR-020 · docs/ui-ux/README.md §4 "/contacts" screen.
export default function ContactsPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canWrite = session?.role !== 'VIEWER';
  const canDelete = session?.role === 'OWNER' || session?.role === 'ADMIN' || session?.role === 'SALES_MANAGER';

  const load = useCallback(async (current: Session) => {
    try {
      const result = await listContacts(current.accessToken);
      setContacts(result.data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load contacts.');
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
    void load(current);
  }, [router, load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      await createContact(session.accessToken, { name: newName, email: newEmail || undefined });
      setNewName('');
      setNewEmail('');
      setShowNewForm(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create contact.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!session) return;
    try {
      await deleteContact(session.accessToken, id);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete contact.');
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        <div className="flex items-center gap-3">
          {canWrite && (
            <button
              type="button"
              onClick={() => setShowNewForm((v) => !v)}
              className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white"
            >
              + New Contact
            </button>
          )}
          <Link href="/" className="text-sm text-neutral-500 underline">
            Back
          </Link>
        </div>
      </div>

      {canWrite && showNewForm && (
        <form onSubmit={handleCreate} className="flex gap-2 rounded border border-neutral-200 p-4">
          <input
            type="text"
            required
            placeholder="Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email (optional)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={isCreating}
            className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isCreating ? 'Creating…' : 'Create'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {contacts === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-neutral-500">No contacts yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-500">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Position</th>
              {canDelete && <th className="py-2">{''}</th>}
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr key={contact.id} className="border-b border-neutral-100">
                <td className="py-2">{contact.name}</td>
                <td className="py-2">{contact.email ?? '—'}</td>
                <td className="py-2">{contact.position ?? '—'}</td>
                {canDelete && (
                  <td className="py-2">
                    <button type="button" onClick={() => handleDelete(contact.id)} className="text-sm text-red-600 underline">
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
