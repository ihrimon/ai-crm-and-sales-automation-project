'use client';

import { CheckCircle2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiRequestError, getOrganization, updateOrganization } from '@/lib/api';
import { readSession, type Session } from '@/lib/session';

export default function SettingsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const canEdit = session?.role === 'OWNER' || session?.role === 'ADMIN';

  useEffect(() => {
    const current = readSession();
    if (!current) return;
    setSession(current);

    getOrganization(current.accessToken, current.organizationId!)
      .then((org) => {
        setName(org.name);
        setSlug(org.slug);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : 'Could not load organization settings.'))
      .finally(() => setLoaded(true));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    setSaved(false);
    setIsSaving(true);
    try {
      await updateOrganization(session.accessToken, session.organizationId!, { name });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save changes.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <PageHeader title="Settings" description="Manage your organization's profile." />

      <Card>
        <form onSubmit={handleSubmit}>
          <CardHeader>
            <CardTitle className="text-base">Organization</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!loaded ? (
              <>
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">Organization name</Label>
                  <Input id="name" value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" value={slug} disabled className="bg-muted" />
                </div>
              </>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {saved && (
              <Alert className="border-success/40 text-success">
                <CheckCircle2 className="size-4" />
                <AlertDescription className="text-success">Saved.</AlertDescription>
              </Alert>
            )}
          </CardContent>
          {canEdit && (
            <CardFooter>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save changes'}
              </Button>
            </CardFooter>
          )}
        </form>
      </Card>
    </div>
  );
}
