'use client';

import type { Contact } from '@ai-crm/types';
import { Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, createContact, deleteContact, listContacts } from '@/lib/api';
import { generateMockCompanies, generateMockContacts } from '@/lib/mock-data';
import { initials } from '@/lib/status';
import { readSession, type Session } from '@/lib/session';

export default function ContactsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canWrite = session?.role !== 'VIEWER';
  const canDelete = session?.role === 'OWNER' || session?.role === 'ADMIN' || session?.role === 'SALES_MANAGER';

  const load = useCallback(async (current: Session) => {
    try {
      const result = await listContacts(current.accessToken);
      if (result.data.length === 0) {
        const companies = generateMockCompanies(6);
        setContacts(generateMockContacts(companies, 14));
        setIsSample(true);
      } else {
        setContacts(result.data);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load contacts.');
    }
  }, []);

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);
    void load(current);
  }, [load]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setIsCreating(true);
    setError(null);
    try {
      await createContact(session.accessToken, { name: newName, email: newEmail || undefined });
      setNewName('');
      setNewEmail('');
      setDialogOpen(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create contact.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!session || isSample) return;
    try {
      await deleteContact(session.accessToken, id);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete contact.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contacts"
        description="People connected to your leads, deals, and companies."
        actions={
          <>
            {isSample && <SampleDataBadge />}
            {canWrite && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus />
                    New Contact
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader>
                      <DialogTitle>Create a new contact</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 py-4">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="newName">Name</Label>
                        <Input id="newName" required value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="newEmail">Email (optional)</Label>
                        <Input id="newEmail" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={isCreating}>
                        {isCreating ? 'Creating…' : 'Create'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {contacts === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No contacts yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Position</TableHead>
                  {canDelete && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">{initials(contact.name)}</AvatarFallback>
                        </Avatar>
                        {contact.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{contact.email ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{contact.position ?? '—'}</TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete(contact.id)}>
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
    </div>
  );
}
