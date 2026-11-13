import React from 'react';
import { STATUSES, STATUS_META } from '@/lib/status';

// Status distribution donut built from real counts (byStatus). No chart library.
export default function Donut({ byStatus, centerLabel = 'Total' }: { byStatus: Record<string, number>; centerLabel?: string }) {
  const entries = STATUSES.map((s) => ({ s, n: byStatus?.[s] ?? 0 }));
  const total = entries.reduce((a, b) => a + b.n, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#E4EFE7" strokeWidth="16" />
          {total > 0 &&
            entries
              .filter((e) => e.n > 0)
              .map((e) => {
                const len = (e.n / total) * C;
                const el = (
                  <circle key={e.s} cx="70" cy="70" r={R} fill="none" stroke={STATUS_META[e.s].dot} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />
                );
                offset += len;
                return el;
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-ink">{total}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid flex-1 grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-1">
        {entries.map((e) => (
          <li key={e.s} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_META[e.s].dot }} />
              {STATUS_META[e.s].label}
            </span>
            <span className="font-medium text-ink">{e.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
