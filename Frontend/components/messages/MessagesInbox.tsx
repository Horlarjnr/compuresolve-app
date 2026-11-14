'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import Chat from '@/components/complaints/Chat';
import Icon from '@/components/ui/Icon';
import { Avatar, PageHeader, SearchInput, Skeleton, StatusBadge, TextLink, cx } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useDebounced, useFetch } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import { asList } from '@/lib/util';

// Chat-app style inbox: conversations on the left, the open conversation on the right.
// On a phone only one side shows at a time: the list, or the conversation with a back arrow.
export default function MessagesInbox({ slug, staff, assigned, activeId }: { slug: string; staff: boolean; assigned?: 'me'; activeId?: string }) {
  // Fit the viewport under the top bar (students also have a bottom tab bar on phones).
  const mobileHeight =
    slug === 'student'
      ? activeId ? 'h-[calc(100dvh-13rem)]' : 'h-[calc(100dvh-14rem)]'
      : activeId ? 'h-[calc(100dvh-9rem)]' : 'h-[calc(100dvh-10rem)]';

  return (
    <>
      <div className={cx(activeId && 'hidden md:block')}>
        <PageHeader title="Messages" subtitle={staff ? 'Conversations on complaints you can see.' : 'Your conversations with the staff handling your complaints.'} />
      </div>
      <div className={cx('grid min-h-[420px] overflow-hidden rounded-2xl border border-line bg-white shadow-card md:h-[calc(100dvh-10rem)] md:grid-cols-[340px_1fr]', mobileHeight)}>
        <section className={cx('min-h-0 flex-col border-line md:flex md:border-r', activeId ? 'hidden' : 'flex')} aria-label="Conversations">
          <ConversationList slug={slug} staff={staff} assigned={assigned} activeId={activeId} />
        </section>
        <section className={cx('min-h-0 flex-col md:flex', activeId ? 'flex' : 'hidden')} aria-label="Conversation">
          {activeId ? (
            <Thread key={activeId} slug={slug} staff={staff} id={activeId} />
          ) : (
            <EmptyState icon="message" title="Select a conversation" message="Pick a complaint on the left to read and reply to its messages." />
          )}
        </section>
      </div>
    </>
  );
}

function ConversationList({ slug, staff, assigned, activeId }: { slug: string; staff: boolean; assigned?: 'me'; activeId?: string }) {
  const [q, setQ] = useState('');
  const dq = useDebounced(q);
  const { data, loading, error, refetch } = useFetch<any>('/complaints', {
    query: { limit: 50, assigned, q: dq.trim().length >= 2 ? dq.trim() : undefined },
    interval: 30000,
  });
  const rows: any[] = asList(data);

  return (
    <>
      <div className="border-b border-line p-3">
        <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <DataState
          loading={loading}
          error={error}
          onRetry={refetch}
          skeleton={<div className="space-y-4 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
          empty={rows.length === 0}
          emptyNode={<EmptyState icon="message" title={dq.trim() ? 'No matching conversations' : 'No conversations yet'} message={staff ? 'Complaints you can message about will appear here.' : 'When you submit a complaint, its conversation appears here.'} />}
        >
          <ul>
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/${slug}/messages/${r.id}`}
                  aria-current={r.id === activeId ? 'page' : undefined}
                  className={cx('flex items-start gap-3 border-b border-line/60 px-4 py-3.5 transition-colors', r.id === activeId ? 'bg-mint/60' : 'hover:bg-mint/30')}
                >
                  <Avatar name={staff ? r.submittedBy?.fullName : r.title} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-ink">{staff ? r.submittedBy?.fullName ?? 'Student' : r.title}</p>
                      <span className="shrink-0 text-[11px] text-muted">{fmtRelative(r.updatedAt)}</span>
                    </div>
                    <p className="truncate text-sm text-muted">{staff ? r.title : r.category?.name}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-soft">{r.reference}</span>
                      <StatusBadge status={r.status} />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </DataState>
      </div>
    </>
  );
}

function Thread({ slug, staff, id }: { slug: string; staff: boolean; id: string }) {
  const { data: c, loading, error, refetch } = useFetch<any>(`/complaints/${id}`);
  const closed = !staff && !!c && ['CLOSED', 'REJECTED'].includes(c.status);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-3 py-3 sm:px-4">
        <Link href={`/${slug}/messages`} aria-label="Back to conversations" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink hover:bg-mint/60 md:hidden">
          <span aria-hidden="true" className="text-lg leading-none">←</span>
        </Link>
        {loading ? (
          <Skeleton className="h-10 w-2/3" />
        ) : c ? (
          <>
            <Avatar name={staff ? c.submittedBy?.fullName : c.title} size={40} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{staff ? c.submittedBy?.fullName ?? 'Student' : c.title}</p>
              <p className="truncate text-xs text-muted">{staff ? c.title : c.reference}</p>
            </div>
            <div className="hidden shrink-0 sm:block"><StatusBadge status={c.status} /></div>
            <TextLink href={`/${slug}/complaints/${id}`} className="shrink-0 text-sm">View complaint</TextLink>
          </>
        ) : (
          <p className="text-sm text-muted">Conversation</p>
        )}
      </header>
      <div className="min-h-0 flex-1 p-3 sm:p-4">
        {error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted">
            <Icon name="alert" size={22} />
            <p>We couldn't open this conversation. It may not exist or you may not have access.</p>
            <button type="button" onClick={refetch} className="font-medium text-soft hover:underline">Try again</button>
          </div>
        ) : c ? (
          <Chat complaintId={id} staff={staff} closed={closed} fill />
        ) : null}
      </div>
    </>
  );
}
