import React from 'react';
import { StatusBadge } from '@/components/ui/primitives';
import { fmtDateTime } from '@/lib/format';

// Status history, newest first. `actor` is only present for staff views.
export default function Timeline({ history }: { history: any[] }) {
  const items = [...(history ?? [])].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  if (!items.length) return <p className="text-sm text-muted">No history yet.</p>;
  return (
    <ol className="relative space-y-5 border-l border-line pl-5">
      {items.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-white bg-soft ring-1 ring-line" />
          <StatusBadge status={h.toStatus} />
          <p className="mt-1.5 text-xs text-muted">
            {fmtDateTime(h.createdAt)}
            {h.actor?.fullName ? ` · ${h.actor.fullName}` : ''}
          </p>
          {h.reason && <p className="mt-1 text-sm text-ink">{h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}
