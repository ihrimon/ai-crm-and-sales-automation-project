// Placeholder — real screens (see docs/ui-ux/README.md) land starting
// Milestone M1 (Auth: /login, /register). This is Milestone M0: the
// workspace exists and boots, nothing feature-shaped yet.
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">AI CRM & Sales Automation</h1>
      <p className="max-w-md text-sm text-neutral-500">
        Project scaffolding — Milestone M0. See{' '}
        <code>docs/development-plan/README.md</code> for what&apos;s next.
      </p>
    </main>
  );
}
