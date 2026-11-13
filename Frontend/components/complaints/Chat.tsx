'use client';
import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';
import { Button, Pill, Skeleton, cx } from '@/components/ui/primitives';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { fmtDateTime } from '@/lib/format';
import { asList } from '@/lib/util';

// Complaint conversation. Staff may send STAFF_ONLY notes; students never see those (the API filters them out).
export default function Chat({ complaintId, staff, closed }: { complaintId: string; staff: boolean; closed?: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, refetch, silentRefetch } = useFetch<any>(`/complaints/${complaintId}/messages`, { query: { limit: 100 }, interval: 15000 });
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = asList(data);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await api(`/complaints/${complaintId}/messages`, { method: 'POST', body: { body: text, ...(staff && internal ? { visibility: 'STAFF_ONLY' } : {}) } });
      setBody('');
      setInternal(false);
      await silentRefetch();
    } catch (err) {
      toast.error(errorMessage(err, "Your message couldn't be sent."));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="max-h-[420px] min-h-[160px] space-y-4 overflow-y-auto rounded-xl bg-page p-4" aria-live="polite">
        {loading ? (
          <div className="space-y-3"><Skeleton className="h-14 w-2/3" /><Skeleton className="ml-auto h-14 w-2/3" /></div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-muted">Couldn't load the conversation. <button className="font-medium text-soft" onClick={refetch}>Retry</button></p>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet. {staff ? 'Write to the student below.' : 'You can write to the staff handling your complaint below.'}</p>
        ) : (
          messages.map((m) => {
            const mine = staff ? m.sender?.id === user?.id : m.isYou;
            const fromStudent = m.senderRole === 'STUDENT';
            const label = staff ? (mine ? 'You' : m.sender?.fullName) : mine ? 'You' : 'Staff';
            return (
              <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[85%] rounded-2xl px-4 py-2.5', mine ? 'rounded-br-md bg-forest text-white' : 'rounded-bl-md border border-line bg-white text-ink', m.visibility === 'STAFF_ONLY' && 'border-2 border-dashed border-amber-400 bg-amber-50 text-ink')}>
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] opacity-80">
                    <span className="font-medium">{label}{staff && fromStudent ? ' (student)' : ''}</span>
                    {m.visibility === 'STAFF_ONLY' && <Pill tone="amber">Internal</Pill>}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm">{m.body}</p>
                  <p className="mt-1 text-right text-[10px] opacity-60">{fmtDateTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {closed ? (
        <p className="mt-3 rounded-xl bg-mint/60 px-4 py-3 text-sm text-forest">This complaint is closed to new messages.</p>
      ) : (
        <form onSubmit={send} className="mt-3 space-y-2">
          <div className="flex items-end gap-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 768) { e.preventDefault(); send(e as any); } }}
              maxLength={2000}
              rows={2}
              placeholder={staff && internal ? 'Write an internal note (staff only)…' : 'Type your message…'}
              aria-label="Message"
              className="min-h-[48px] flex-1 resize-none rounded-xl border border-line bg-white px-3.5 py-3 text-sm focus:border-soft focus:outline-none focus:ring-2 focus:ring-soft/30"
            />
            <Button type="submit" loading={sending} disabled={!body.trim()} aria-label="Send message" className="h-12 w-12 !px-0"><Icon name="send" size={18} /></Button>
          </div>
          {staff && (
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="h-4 w-4 accent-[#235347]" />
              Internal note: visible to staff only, never to the student
            </label>
          )}
        </form>
      )}
    </div>
  );
}
