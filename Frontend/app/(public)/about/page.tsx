import type { Metadata } from 'next';
import { Button } from '@/components/ui/primitives';
import { PublicFooter, PublicHeader } from '@/components/layout/PublicChrome';

export const metadata: Metadata = { title: 'About' };

const ROLES = [
  ['Student', 'Submits complaints to their department or the faculty, follows their progress, writes to staff and can ask for a resolved complaint to be reopened.'],
  ['Department Officer', 'Works the department queue: claims complaints, talks to students, updates statuses and handles reopen requests on their own cases.'],
  ['Head of Department', 'Sees department-wide statistics, assigns complaints to officers, escalates cases to the faculty, and manages officers and categories.'],
  ['Faculty Admin', 'Handles faculty-level and escalated complaints, manages departments, categories and staff invitations.'],
];

export default function About() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-5 py-14">
        <h1 className="text-3xl font-semibold text-forest sm:text-4xl">About CompuResolve</h1>
        <p className="mt-5 text-base leading-relaxed text-muted">
          CompuResolve gives the Faculty of Computing one place to raise, route and resolve complaints. Each department works as its own space, and issues that need a faculty decision can be escalated rather than lost in email threads.
        </p>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Complaint content stays private to the people who are allowed to see it. Students see their own complaints, staff see what their role covers, and nobody can look up complaints they have no access to.
        </p>

        <h2 className="mt-12 text-xl font-semibold text-forest">Who uses it</h2>
        <dl className="mt-5 space-y-4">
          {ROLES.map(([k, v]) => (
            <div key={k} className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <dt className="font-semibold text-ink">{k}</dt>
              <dd className="mt-1 text-sm text-muted">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button href="/register" size="lg">Create a student account</Button>
          <Button href="/login" variant="secondary" size="lg">Sign in</Button>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
