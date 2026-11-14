'use client';
import React from 'react';
import Link from 'next/link';
import { Button, Card, CardHeader, PageHeader, Skeleton, StatCard, StatusBadge, TextLink } from '@/components/ui/primitives';
import { ErrorFromApi, EmptyState } from '@/components/ui/States';
import Donut from '@/components/ui/Donut';
import { useFetch } from '@/lib/hooks';
import { useAuth } from '@/components/providers/AuthProvider';
import { fmtDate } from '@/lib/format';
import { asList } from '@/lib/util';
import { SLUG_ROLE } from '@/lib/roles';

function Recent({ slug, items, title = 'Recent complaints', viewAll }: { slug: string; items: any[]; title?: string; viewAll?: string }) {
  const staff = slug !== 'student';
  return (
    <Card>
      <CardHeader title={title} action={viewAll ? <TextLink href={viewAll} className="text-sm">View all</TextLink> : undefined} />
      {items.length === 0 ? (
        <EmptyState title="Nothing here yet" message="Complaints will show up here as they come in." />
      ) : (
        <ul className="divide-y divide-line">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/${slug}/complaints/${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-mint/30 sm:px-2 sm:rounded-lg">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{r.title}</span>
                  <span className="block text-xs text-muted">{r.reference} · {staff && r.submittedBy ? `${r.submittedBy.fullName} · ` : ''}{fmtDate(r.createdAt)}</span>
                </span>
                <StatusBadge status={r.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function Dashboard({ slug }: { slug: string }) {
  const { user, departmentName } = useAuth();
  const { data, loading, error, refetch } = useFetch<any>('/dashboard/summary');
  const firstName = (user?.fullName || '').replace(/^(Dr|Prof)\.?\s+/i, '').split(' ')[0];

  if (loading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-72" />
      </div>
    );
  if (error) return <Card><ErrorFromApi error={error} onRetry={refetch} /></Card>;

  const unread = data?.unreadNotifications ?? 0;
  const base = `/${slug}`;

  // ---------------- Student ----------------
  if (slug === 'student') {
    const s = data?.student;
    return (
      <>
        <PageHeader title={`Welcome back, ${firstName}`} subtitle="Here is where your complaints stand." action={<Button href={`${base}/submit`} icon="plus">Submit complaint</Button>} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total complaints" value={s?.total ?? 0} icon="file" href={`${base}/complaints`} />
          <StatCard label="In progress" value={s?.byStatus?.IN_PROGRESS ?? 0} icon="clock" tone="blue" />
          <StatCard label="Awaiting your reply" value={s?.awaitingMyReply ?? 0} icon="message" tone="purple" />
          <StatCard label="Resolved" value={s?.byStatus?.RESOLVED ?? 0} icon="check-circle" tone="green" />
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3"><Recent slug={slug} items={s?.recent ?? []} viewAll={`${base}/complaints`} /></div>
          <div className="space-y-6 lg:col-span-2">
            <Card><CardHeader title="Status overview" /><Donut byStatus={s?.byStatus ?? {}} /></Card>
            {unread > 0 && (
              <Card>
                <p className="text-sm text-ink">You have <strong>{unread}</strong> unread notification{unread === 1 ? '' : 's'}.</p>
                <Button href={`${base}/notifications`} variant="secondary" size="sm" className="mt-3">Open notifications</Button>
              </Card>
            )}
          </div>
        </div>
      </>
    );
  }

  // ---------------- Officer ----------------
  if (slug === 'officer') {
    const o = data?.officer;
    const depts = o?.departments ?? [];
    return (
      <>
        <PageHeader title={`Welcome back, ${firstName}`} subtitle="Your department queue at a glance." />
        {depts.map((d: any) => (
          <section key={d.department.id} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{d.department.name}</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Open in queue" value={d.queue.open} icon="inbox" href={`${base}/queue`} />
              <StatCard label="Unassigned" value={d.queue.unassigned} icon="alert" tone="amber" href={`${base}/queue`} />
              <StatCard label="Assigned to me" value={d.assignedToMe.open} icon="user" tone="blue" href={`${base}/complaints`} />
              <StatCard label="Reopen decisions" value={o.reopenDecisionsPending} icon="refresh" tone="purple" href={`${base}/reopen`} />
            </div>
            <div className="mt-6"><Card><CardHeader title="Department queue by status" /><Donut byStatus={d.queue.byStatus} /></Card></div>
          </section>
        ))}
        <Recent slug={slug} items={o?.recentAssigned ?? []} title="Recently assigned to you" viewAll={`${base}/complaints`} />
      </>
    );
  }

  // ---------------- HOD ----------------
  if (slug === 'hod') {
    const depts = data?.hod?.departments ?? [];
    return (
      <>
        <PageHeader title={`Welcome back, ${firstName}`} subtitle="Department-wide complaint statistics." />
        {depts.map((d: any) => (
          <section key={d.department.id} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{d.department.name}</h2>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Open complaints" value={d.open} icon="inbox" href={`${base}/complaints`} />
              <StatCard label="Unassigned" value={d.unassigned} icon="alert" tone="amber" href={`${base}/complaints`} />
              <StatCard label="Escalated to faculty" value={d.escalated} icon="layers" tone="red" />
              <StatCard label="Reopen requests" value={d.reopenPending} icon="refresh" tone="purple" href={`${base}/reopen`} />
            </div>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <Card><CardHeader title="Complaints by status" /><Donut byStatus={d.byStatus} /></Card>
              <Card>
                <CardHeader title="Officer workload" subtitle="Open complaints assigned to each officer" action={<TextLink href={`${base}/staff`} className="text-sm">Manage staff</TextLink>} />
                {d.officers.length === 0 ? (
                  <EmptyState icon="users" title="No active officers" message="Invite an officer so complaints can be assigned." action={<Button href={`${base}/invitations`} size="sm">Invite officer</Button>} />
                ) : (
                  <ul className="space-y-3">
                    {d.officers.map((of: any) => (
                      <li key={of.id} className="flex items-center justify-between text-sm">
                        <span className="text-ink">{of.fullName}</span>
                        <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-forest">{of.openAssigned} open</span>
                      </li>
                    ))}
                  </ul>
                )}
                {d.oldestOpenAgeDays != null && <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Oldest open complaint is {d.oldestOpenAgeDays} day{d.oldestOpenAgeDays === 1 ? '' : 's'} old.</p>}
              </Card>
            </div>
          </section>
        ))}
      </>
    );
  }

  // ---------------- Faculty admin ----------------
  const f = data?.facultyAdmin;
  return (
    <>
      <PageHeader title={`Welcome back, ${firstName}`} subtitle="Faculty-level complaints and escalations." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Faculty-level open" value={f?.facultyLevel?.open ?? 0} icon="layers" href={`${base}/complaints`} />
        <StatCard label="Escalated cases" value={f?.escalated?.total ?? 0} icon="alert" tone="red" href={`${base}/escalated`} />
        <StatCard label="Reopen requests" value={f?.reopenPending ?? 0} icon="refresh" tone="purple" href={`${base}/reopen`} />
        <StatCard label="Unread notifications" value={unread} icon="bell" tone="amber" href={`${base}/notifications`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Faculty-level complaints" /><Donut byStatus={f?.facultyLevel?.byStatus ?? {}} /></Card>
        <Card><CardHeader title="Escalated from departments" /><Donut byStatus={f?.escalated?.byStatus ?? {}} /></Card>
      </div>
      <div className="mt-6"><Recent slug={slug} items={f?.recent ?? []} viewAll={`${base}/complaints`} /></div>
    </>
  );
}
