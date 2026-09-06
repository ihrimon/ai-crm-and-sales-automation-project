'use client';

import type { Company } from '@ai-crm/types';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { SampleDataBadge } from '@/components/sample-data-badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiRequestError, createCompany, deleteCompany, listCompanies } from '@/lib/api';
import { generateMockCompanies } from '@/lib/mock-data';
import { readSession, type Session } from '@/lib/session';

export default function CompaniesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const canWrite = session?.role !== 'VIEWER';
  const canDelete = session?.role === 'OWNER' || session?.role === 'ADMIN' || session?.role === 'SALES_MANAGER';

  const load = useCallback(async (current: Session) => {
    try {
      const result = await listCompanies(current.accessToken);
      if (result.data.length === 0) {
        setCompanies(generateMockCompanies(10));
        setIsSample(true);
      } else {
        setCompanies(result.data);
        setIsSample(false);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load companies.');
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
      await createCompany(session.accessToken, { name: newName });
      setNewName('');
      setDialogOpen(false);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create company.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!session || isSample) return;
    try {
      await deleteCompany(session.accessToken, id);
      await load(session);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not delete company.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Companies"
        description="Accounts your leads, contacts, and deals belong to."
        actions={
          <>
            {isSample && <SampleDataBadge />}
            {canWrite && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus />
                    New Company
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreate}>
                    <DialogHeader>
                      <DialogTitle>Create a new company</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-2 py-4">
                      <Label htmlFor="newName">Company name</Label>
                      <Input id="newName" required value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
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
          {companies === null ? (
            <div className="flex flex-col gap-2 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No companies yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Website</TableHead>
                  <TableHead>Industry</TableHead>
                  {canDelete && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-md border bg-muted">
                          <Building2 className="size-3.5 text-muted-foreground" />
                        </div>
                        {company.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{company.website ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">{company.industry ?? '—'}</TableCell>
                    {canDelete && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => handleDelete(company.id)}>
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
