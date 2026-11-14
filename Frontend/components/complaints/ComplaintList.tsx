'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, FilterChips, Input, Pagination, SearchInput, Select, StatusBadge, PageHeader, TableSkeleton, Pill, TextLink } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useDebounced, useFetch } from '@/lib/hooks';
import { STATUSES, STATUS_META } from '@/lib/status';
import { fmtDate } from '@/lib/format';
import { asList } from '@/lib/util';

export type ListMode = 'student' | 'queue' | 'mine' | 'all' | 'escalated';

const TEXT: Record<ListMode, { title: string; subtitle: string }> = {
  student: { title: 'My complaints', subtitle: 'Track every complaint you have submitted.' },
  queue: { title: 'Department queue', subtitle: 'All complaints in your department.' },
  mine: { title: 'My complaints', subtitle: 'Complaints assigned to you.' },
  all: { title: 'Complaints', subtitle: 'Everything you are allowed to see.' },
  escalated: { title: 'Escalated cases', subtitle: 'Complaints escalated from departments to the faculty.' },
};

export default function ComplaintList({ slug, mode, titleOverride }: { slug: string; mode: ListMode; titleOverride?: string }) {
  const staff = mode !== 'student';
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [assigned, setAssigned] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);

  // Pick up ?q= from the top-bar search.
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) setQ(initial);
  }, []);
  useEffect(() => setPage(1), [status, categoryId, assigned, dq]);

  const query: Record<string, any> = {
    page: mode === 'escalated' ? 1 : page,
    limit: mode === 'escalated' ? 100 : 10,
    status: status || undefined,
    categoryId: categoryId || undefined,
    assigned: mode === 'mine' ? 'me' : assigned || undefined,
    q: dq.trim().length >= 2 ? dq.trim() : undefined,
  };
  const { data, meta, loading, error, refetch } = useFetch<any>('/complaints', { query });
  const { data: cats } = useFetch<any>('/categories');
  const categories = asList(cats);

  let rows: any[] = asList(data);
  // The API has no "escalated" filter; the staff view includes an escalatedToFaculty flag.
  if (mode === 'escalated') rows = rows.filter((r) => r.escalatedToFaculty);
  const totalPages = mode === 'escalated' ? 1 : Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 10));
  const filtered = !!(status || categoryId || assigned || query.q);
  const t = TEXT[mode];

  return (
    <>
      <PageHeader
        title={titleOverride ?? t.title}
        subtitle={t.subtitle}
        action={mode === 'student' ? <Button href={`/${slug}/submit`} icon="plus">Submit complaint</Button> : undefined}
      />
      <Card pad={false}>
        <div className="border-b border-line px-4 pt-4">
          <FilterChips
            label="Filter by status"
            value={status}
            onChange={setStatus}
            options={[{ value: '', label: 'All' }, ...STATUSES.map((s) => ({ value: s, label: STATUS_META[s].label }))]}
          />
        </div>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or reference" aria-label="Search" />
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {(mode === 'queue' || mode === 'all') && (
            <Select value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Filter by assignment">
              <option value="">Assigned and unassigned</option>
              <option value="none">Unassigned</option>
              <option value="me">Assigned to me</option>
            </Select>
          )}
        </div>

        <div className="p-4 sm:p-5">
          <DataState
            loading={loading}
            error={error}
            onRetry={refetch}
            skeleton={<TableSkeleton />}
            empty={rows.length === 0}
            emptyNode={
              filtered ? (
                <EmptyState icon="search" title="No results for this filter" message="Try a different status, category or search term." action={<Button variant="secondary" onClick={() => { setStatus(''); setCategoryId(''); setAssigned(''); setQ(''); }}>Clear filters</Button>} />
              ) : (
                <EmptyState
                  title={mode === 'student' ? 'No complaints yet' : mode === 'escalated' ? 'No escalated complaints' : 'No complaints here'}
                  message={mode === 'student' ? "When you submit a complaint, you'll be able to track it here." : 'New complaints will appear here.'}
                  action={mode === 'student' ? <Button href={`/${slug}/submit`} icon="plus">Submit a complaint</Button> : undefined}
                />
              )
            }
          >
            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="pb-3 pr-4 font-medium">Reference</th>
                    <th className="pb-3 pr-4 font-medium">Title</th>
                    <th className="pb-3 pr-4 font-medium">Category</th>
                    {staff && <th className="pb-3 pr-4 font-medium">Student</th>}
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    {staff && <th className="pb-3 pr-4 font-medium">Assigned to</th>}
                    <th className="pb-3 font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 hover:bg-mint/30">
                      <td className="py-3.5 pr-4"><TextLink href={`/${slug}/complaints/${r.id}`}>{r.reference}</TextLink></td>
                      <td className="max-w-[260px] truncate py-3.5 pr-4">{r.title}</td>
                      <td className="py-3.5 pr-4 text-muted">{r.category?.name}</td>
                      {staff && <td className="py-3.5 pr-4">{r.submittedBy?.fullName}</td>}
                      <td className="py-3.5 pr-4"><StatusBadge status={r.status} /></td>
                      {staff && <td className="py-3.5 pr-4 text-muted">{r.assignedTo?.fullName ?? <Pill tone="amber">Unassigned</Pill>}</td>}
                      <td className="py-3.5 text-muted">{fmtDate(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile cards */}
            <ul className="space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id}>
                  <Link href={`/${slug}/complaints/${r.id}`} className="block rounded-xl border border-line p-4 active:bg-mint/40">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-medium text-soft">{r.reference}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-2 font-medium text-ink">{r.title}</p>
                    <p className="mt-1 text-xs text-muted">{r.category?.name} · {fmtDate(r.createdAt)}</p>
                    {staff && (
                      <p className="mt-2 text-xs text-muted">
                        {r.submittedBy?.fullName} · {r.assignedTo?.fullName ? `Assigned to ${r.assignedTo.fullName}` : 'Unassigned'}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </DataState>
        </div>
      </Card>
    </>
  );
}
