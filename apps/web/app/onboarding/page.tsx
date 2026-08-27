'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiRequestError, createOrganization, refresh } from '../../lib/api';
import { readSession, saveSession } from '../../lib/session';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// FR-006 · POST /organizations · docs/ui-ux/README.md §4 "/onboarding" screen
// ("any authenticated user; caller becomes OWNER"). The access token issued
// at register/login predates any organization, so after creating one this
// page calls /auth/refresh to pick up a token scoped to it (AuthService
// re-resolves active membership on every refresh) before continuing.
export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditedByUser, setSlugEditedByUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const session = readSession();
    if (!session) {
      router.replace('/login');
    } else if (session.organizationId) {
      router.replace('/');
    }
  }, [router]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEditedByUser) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const session = readSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    setIsSubmitting(true);
    try {
      await createOrganization(session.accessToken, { name, slug });
      const newTokens = await refresh(session.refreshToken);
      saveSession(newTokens);
      router.push('/');
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold">Create your organization</h1>
        <p className="mb-6 text-center text-sm text-neutral-500">You&apos;ll be its owner.</p>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Organization name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="slug" className="text-sm font-medium">
              Slug
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug}
              onChange={(e) => {
                setSlugEditedByUser(true);
                setSlug(e.target.value);
              }}
              className="rounded border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Creating…' : 'Create organization'}
          </button>
        </form>
      </div>
    </main>
  );
}
