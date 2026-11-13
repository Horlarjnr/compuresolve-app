'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, PageHeader, Pagination, Tabs, cx } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import Icon from '@/components/ui/Icon';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { fmtRelative } from '@/lib/format';
import { asList } from '@/lib/util';

export default function Notifications({ slug }: { slug: string }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const { data, meta, loading, error, refetch } = useFetch<any>('/notifications', { query: { page, limit: 15, unread: tab === 'unread' ? true : undefined } });
  const items = asList(data);

  const open = async (n: any) => {
    try {
      if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'PATCH' });
    } catch {}
    if (n.complaintId) router.push(`/${slug}/complaints/${n.complaintId}`);
    else refetch();
  };

  // There is no bulk endpoint, so this marks each unread item on this page one by one.
  const markPageRead = async () => {
    setBusy(true);
    try {
      await Promise.all(items.filter((n) => !n.readAt).map((n) => api(`/notifications/${n.id}/read`, { method: 'PATCH' })));
      toast.success('Marked as read');
      await refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={meta?.unread ? `${meta.unread} unread` : 'Updates about your complaints.'}
        action={items.some((n) => !n.readAt) ? <Button variant="secondary" size="sm" icon="check" loading={busy} onClick={markPageRead}>Mark these as read</Button> : undefined}
      />
      <Card pad={false}>
        <div className="px-4 pt-2 sm:px-6">
          <Tabs tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread' }]} value={tab} onChange={(v) => { setTab(v); setPage(1); }} />
        </div>
        <div className="p-2 sm:p-4">
          <DataState
            loading={loading}
            error={error}
            onRetry={refetch}
            empty={items.length === 0}
            emptyNode={<EmptyState icon="bell" title={tab === 'unread' ? "You're all caught up" : 'No notifications yet'} message="We'll let you know when something changes on a complaint." />}
          >
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={cx('flex w-full gap-3 rounded-xl px-3 py-3.5 text-left hover:bg-mint/40', !n.readAt && 'bg-mint/30')}>
                    <span className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', n.readAt ? 'bg-gray-100 text-muted' : 'bg-mint text-soft')}><Icon name="bell" size={17} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{n.title}</span>
                        <span className="shrink-0 text-xs text-muted">{fmtRelative(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-soft" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="px-3 pb-3"><Pagination page={page} totalPages={Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 15))} onChange={setPage} /></div>
          </DataState>
        </div>
      </Card>
    </>
  );
}
