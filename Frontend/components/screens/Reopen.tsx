'use client';
import React, { useState } from 'react';
import { Button, Card, Modal, PageHeader, Pill, Pagination, StatusBadge, Tabs, Textarea, TextLink } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { fmtDate } from '@/lib/format';
import { asList } from '@/lib/util';

export default function Reopen({ slug }: { slug: string }) {
  const toast = useToast();
  const [tab, setTab] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, refetch } = useFetch<any>('/reopen-requests', { query: { status: tab === 'ALL' ? undefined : tab, page, limit: 10 } });
  const rows = asList(data);
  const [target, setTarget] = useState<{ row: any; decision: 'APPROVE' | 'REJECT' } | null>(null);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!target) return;
    if (target.decision === 'REJECT' && note.trim().length < 5) return setNoteErr('A note is required when rejecting. The student will see it.');
    setBusy(true);
    try {
      await api(`/reopen-requests/${target.row.id}/decision`, { method: 'POST', body: { decision: target.decision, ...(note.trim() ? { note: note.trim() } : {}) } });
      toast.success(target.decision === 'APPROVE' ? 'Complaint reopened' : 'Request rejected');
      setTarget(null);
      setNote('');
      refetch();
    } catch (e) {
      setNoteErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Reopen requests" subtitle="Students asking for resolved, closed or rejected complaints to be looked at again." />
      <Card pad={false}>
        <div className="px-4 pt-2 sm:px-6">
          <Tabs
            tabs={[{ value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }, { value: 'ALL', label: 'All' }]}
            value={tab}
            onChange={(v) => { setTab(v); setPage(1); }}
          />
        </div>
        <div className="p-4 sm:p-5">
          <DataState loading={loading} error={error} onRetry={refetch} empty={rows.length === 0} emptyNode={<EmptyState icon="refresh" title="No reopen requests" message={tab === 'PENDING' ? 'Nothing is waiting for a decision.' : 'No requests match this filter.'} />}>
            <ul className="space-y-4">
              {rows.map((r) => (
                <li key={r.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <TextLink href={`/${slug}/complaints/${r.complaint.id}`} className="text-sm">{r.complaint.reference}</TextLink>
                      <p className="truncate font-medium text-ink">{r.complaint.title}</p>
                      <p className="text-xs text-muted">{r.requester?.fullName}{r.requester?.matricNumber ? ` (${r.requester.matricNumber})` : ''} · {fmtDate(r.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={r.complaint.status} />
                      <Pill tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Pill>
                    </div>
                  </div>
                  <p className="mt-3 rounded-lg bg-page p-3 text-sm text-ink">“{r.reason}”</p>
                  {r.decisionNote && <p className="mt-2 text-xs text-muted">Response: {r.decisionNote}</p>}
                  {r.status === 'PENDING' && r.canDecide && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => { setNote(''); setNoteErr(''); setTarget({ row: r, decision: 'APPROVE' }); }}>Approve</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => { setNote(''); setNoteErr(''); setTarget({ row: r, decision: 'REJECT' }); }}>Reject</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 10))} onChange={setPage} />
          </DataState>
        </div>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={target?.decision === 'APPROVE' ? 'Approve reopen request' : 'Reject reopen request'}
        footer={<><Button variant="secondary" onClick={() => setTarget(null)}>Cancel</Button><Button variant={target?.decision === 'REJECT' ? 'danger' : 'primary'} loading={busy} onClick={submit}>{target?.decision === 'APPROVE' ? 'Approve' : 'Reject'}</Button></>}
      >
        <Textarea label={target?.decision === 'REJECT' ? 'Note to the student (required)' : 'Note to the student (optional)'} value={note} onChange={(e) => setNote(e.target.value)} error={noteErr} maxLength={2000} placeholder={target?.decision === 'REJECT' ? 'Explain why this request is being declined…' : 'Add a note for the student (optional)…'} />
      </Modal>
    </>
  );
}
