'use client';
import React, { useState } from 'react';
import { Banner, Button, Card, CardHeader, Modal, Select, Skeleton, StatusBadge, Textarea, Pill, TextLink } from '@/components/ui/primitives';
import { ErrorFromApi } from '@/components/ui/States';
import Icon from '@/components/ui/Icon';
import Timeline from './Timeline';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { REASON_REQUIRED, STATUS_META, statusLabel } from '@/lib/status';
import { asList } from '@/lib/util';

const toStatus = (t: any) => (typeof t === 'string' ? t : t?.toStatus ?? t?.status);

export default function ComplaintDetail({ slug, id }: { slug: string; id: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data: c, loading, error, refetch } = useFetch<any>(`/complaints/${id}`);
  const staff = slug !== 'student';
  const isHod = slug === 'hod';

  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [officerId, setOfficerId] = useState('');
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenErr, setReopenErr] = useState('');
  const [decision, setDecision] = useState<null | 'APPROVE' | 'REJECT'>(null);
  const [note, setNote] = useState('');
  const [noteErr, setNoteErr] = useState('');

  // The HOD picks from the department's active officers.
  const deptId = c?.department?.id;
  const { data: members } = useFetch<any>(deptId ? `/departments/${deptId}/members` : null, { query: { limit: 100 }, enabled: isHod && !!deptId });
  const officers = asList(members).filter((m: any) => m.role === 'OFFICER' && m.status === 'ACTIVE');

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !c) {
    // 404 and 403 intentionally look identical: "Complaint not found".
    return (
      <Card>
        <ErrorFromApi error={error!} onRetry={refetch} notFoundTitle="Complaint not found" notFoundMessage="We couldn't find that complaint, or you don't have access to it." />
      </Card>
    );
  }

  const transitions: string[] = (c.allowedTransitions ?? []).map(toStatus).filter(Boolean);
  const pendingReopen = (c.reopenRequests ?? []).find((r: any) => r.status === 'PENDING');

  const run = async (fn: () => Promise<any>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await refetch();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const transition = async (to: string, why?: string) =>
    run(() => api(`/complaints/${id}/status-transitions`, { method: 'POST', body: { toStatus: to, ...(why ? { reason: why } : {}) } }), `Status changed to ${statusLabel(to)}`);

  const onTransitionClick = (to: string) => {
    if (REASON_REQUIRED.includes(to)) {
      setReason('');
      setReasonErr('');
      setReasonFor(to);
    } else transition(to);
  };

  const submitReason = async () => {
    if (reason.trim().length < 5) return setReasonErr('Please give a reason of at least 5 characters. The student will see it.');
    const ok = await transition(reasonFor!, reason.trim());
    if (ok) setReasonFor(null);
  };

  const assign = (officer: string) => run(() => api(`/complaints/${id}/assignments`, { method: 'POST', body: { officerId: officer } }), 'Complaint assigned');
  const unassign = () => run(() => api(`/complaints/${id}/assignments/current`, { method: 'DELETE' }), 'Assignment removed');

  const submitReopen = async () => {
    if (reopenReason.trim().length < 10) return setReopenErr('Please explain why this should be reopened (at least 10 characters).');
    setBusy(true);
    try {
      await api(`/complaints/${id}/reopen-requests`, { method: 'POST', body: { reason: reopenReason.trim() } });
      toast.success('Reopen request sent');
      setReopenOpen(false);
      setReopenReason('');
      await refetch();
    } catch (e) {
      const fe = fieldErrors(e);
      setReopenErr(fe.reason || errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitDecision = async () => {
    if (decision === 'REJECT' && note.trim().length < 5) return setNoteErr('A note is required when rejecting. The student will see it.');
    setBusy(true);
    try {
      await api(`/reopen-requests/${pendingReopen.id}/decision`, { method: 'POST', body: { decision, ...(note.trim() ? { note: note.trim() } : {}) } });
      toast.success(decision === 'APPROVE' ? 'Complaint reopened' : 'Reopen request rejected');
      setDecision(null);
      setNote('');
      await refetch();
    } catch (e) {
      setNoteErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const claimable = slug === 'officer' && !c.assigned && ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'AWAITING_STUDENT'].includes(c.status);
  const showActions = staff || c.canRequestReopen;

  return (
    <>
      <TextLink href={`/${slug}/${slug === 'officer' ? 'queue' : 'complaints'}`} className="mb-4 inline-flex items-center gap-1.5 text-sm">
        <Icon name="arrow-left" size={16} /> Back to complaints
      </TextLink>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-soft">{c.reference}</p>
          <h1 className="mt-1 text-xl font-semibold text-ink sm:text-2xl">{c.title}</h1>
        </div>
        <StatusBadge status={c.status} />
      </div>

      {c.escalatedToFaculty && staff && <div className="mb-4"><Banner tone="warn">This complaint has been escalated to the faculty.</Banner></div>}
      {c.status === 'AWAITING_STUDENT' && !staff && <div className="mb-4"><Banner tone="info">Staff are waiting for your reply. Please respond in the conversation below.</Banner></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Complaint details" />
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <Info label="Category" value={c.category?.name} />
              <Info label="Sent to" value={c.scope === 'FACULTY' ? 'Faculty' : c.department?.name} />
              <Info label="Submitted" value={fmtDate(c.createdAt)} />
              {staff && <Info label="Student" value={c.submittedBy ? `${c.submittedBy.fullName}${c.submittedBy.matricNumber ? ` (${c.submittedBy.matricNumber})` : ''}` : ''} />}
              {staff && <Info label="Assigned to" value={c.assignedTo?.fullName ?? 'Unassigned'} />}
              <Info label="Last updated" value={fmtDate(c.updatedAt)} />
            </dl>
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="mb-2 text-sm font-medium text-muted">Description</h3>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{c.description}</p>
            </div>
            {c.resolutionNote && (
              <div className="mt-5 rounded-xl bg-green-50 p-4">
                <h3 className="mb-1 text-sm font-medium text-green-800">Resolution{c.resolvedAt ? ` · ${fmtDate(c.resolvedAt)}` : ''}</h3>
                <p className="whitespace-pre-wrap text-sm text-green-900">{c.resolutionNote}</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Conversation"
              subtitle={staff ? 'Messages with the student. Internal notes stay with staff.' : 'Messages with the staff handling your complaint.'}
              action={<Button href={`/${slug}/messages/${id}`} variant="secondary" size="sm" icon="message">Open messages</Button>}
            />
          </Card>
        </div>

        <div className="space-y-6">
          {showActions && (
            <Card>
              <CardHeader title="Actions" />
              <div className="space-y-4">
                {claimable && (
                  <Button full icon="check" loading={busy} onClick={() => assign(user.id)}>Claim this complaint</Button>
                )}

                {isHod && c.status !== 'CLOSED' && (
                  <div className="space-y-2">
                    <Select label={c.assigned ? 'Reassign to' : 'Assign to officer'} value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
                      <option value="">Select an officer…</option>
                      {officers.map((m: any) => <option key={m.user.id} value={m.user.id}>{m.user.fullName}</option>)}
                    </Select>
                    <div className="flex gap-2">
                      <Button full variant="secondary" disabled={!officerId} loading={busy} onClick={() => assign(officerId)}>{c.assigned ? 'Reassign' : 'Assign'}</Button>
                      {c.assigned && <Button variant="outline-danger" loading={busy} onClick={unassign}>Unassign</Button>}
                    </div>
                  </div>
                )}

                {staff && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-ink">Change status</p>
                    {transitions.length === 0 ? (
                      <p className="text-sm text-muted">No status changes are available to you right now{slug === 'officer' && !c.assigned ? '. Claim the complaint first.' : '.'}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {transitions.map((to) =>
                          to === 'ESCALATED' ? (
                            <Button key={to} variant="danger" size="sm" icon="alert" disabled={busy} onClick={() => onTransitionClick(to)}>Escalate to faculty</Button>
                          ) : (
                            <Button key={to} variant="secondary" size="sm" disabled={busy} onClick={() => onTransitionClick(to)}>
                              <span className="h-2 w-2 rounded-full" style={{ background: STATUS_META[to]?.dot }} />
                              {statusLabel(to)}
                            </Button>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                )}

                {staff && c.canDecideReopen && pendingReopen && (
                  <div className="rounded-xl bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-900">Reopen request pending</p>
                    <p className="mt-1 text-sm text-amber-900/90">“{pendingReopen.reason}”</p>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" onClick={() => { setNote(''); setNoteErr(''); setDecision('APPROVE'); }}>Approve</Button>
                      <Button size="sm" variant="outline-danger" onClick={() => { setNote(''); setNoteErr(''); setDecision('REJECT'); }}>Reject</Button>
                    </div>
                  </div>
                )}

                {!staff && c.canRequestReopen && (
                  <div>
                    <p className="mb-2 text-sm text-muted">Not satisfied with the outcome? You can ask staff to look at it again.</p>
                    <Button full variant="secondary" icon="refresh" onClick={() => { setReopenErr(''); setReopenOpen(true); }}>Request to reopen</Button>
                  </div>
                )}
              </div>
            </Card>
          )}

          {(c.reopenRequests ?? []).length > 0 && (
            <Card>
              <CardHeader title="Reopen requests" />
              <ul className="space-y-3">
                {c.reopenRequests.map((r: any) => (
                  <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Pill tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'red' : 'amber'}>{r.status.charAt(0) + r.status.slice(1).toLowerCase()}</Pill>
                      <span className="text-xs text-muted">{fmtDate(r.createdAt)}</span>
                    </div>
                    <p className="text-ink">{r.reason}</p>
                    {r.decisionNote && <p className="mt-1 text-xs text-muted">Response: {r.decisionNote}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="History" />
            <Timeline history={c.statusHistory} />
          </Card>
        </div>
      </div>

      <Modal
        open={!!reasonFor}
        onClose={() => setReasonFor(null)}
        title={reasonFor === 'ESCALATED' ? 'Escalate to faculty' : `Change status to ${reasonFor ? statusLabel(reasonFor) : ''}`}
        footer={<><Button variant="secondary" onClick={() => setReasonFor(null)}>Cancel</Button><Button variant={reasonFor === 'ESCALATED' || reasonFor === 'REJECTED' ? 'danger' : 'primary'} loading={busy} onClick={submitReason}>Confirm</Button></>}
      >
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} error={reasonErr} placeholder="Briefly explain the reason for this action…" hint="The student will see this reason in the complaint history." maxLength={2000} />
      </Modal>

      <Modal
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Request to reopen"
        footer={<><Button variant="secondary" onClick={() => setReopenOpen(false)}>Cancel</Button><Button loading={busy} onClick={submitReopen}>Send request</Button></>}
      >
        <Textarea label="Why should this be reopened?" value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} error={reopenErr} maxLength={2000} placeholder="Explain why this complaint should be reopened…" />
      </Modal>

      <Modal
        open={!!decision}
        onClose={() => setDecision(null)}
        title={decision === 'APPROVE' ? 'Approve reopen request' : 'Reject reopen request'}
        footer={<><Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button><Button variant={decision === 'REJECT' ? 'danger' : 'primary'} loading={busy} onClick={submitDecision}>{decision === 'APPROVE' ? 'Approve' : 'Reject'}</Button></>}
      >
        <Textarea label={decision === 'REJECT' ? 'Note to the student (required)' : 'Note to the student (optional)'} value={note} onChange={(e) => setNote(e.target.value)} error={noteErr} maxLength={2000} placeholder={decision === 'REJECT' ? 'Explain why this request is being declined…' : 'Add a note for the student (optional)…'} />
      </Modal>
    </>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value || '—'}</dd>
    </div>
  );
}
