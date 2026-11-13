'use client';
import React from 'react';
import Icon from './Icon';
import { Button, Card, TableSkeleton } from './primitives';
import { ApiError, isNotFound, isRateLimited } from '@/lib/api';

export function EmptyState({ icon = 'inbox', title, message, action }: { icon?: string; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mint text-soft"><Icon name={icon} size={28} /></span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

type Kind = 'notfound' | 'expired' | 'ratelimit' | 'server';
const COPY: Record<Kind, { code: string; icon: string; title: string; message: string }> = {
  notfound: { code: '404', icon: 'search', title: 'Complaint not found', message: "We couldn't find that complaint, or you don't have access to it." },
  expired: { code: '401', icon: 'lock', title: 'Session expired', message: 'Please sign in again.' },
  ratelimit: { code: '429', icon: 'clock', title: 'Too many requests', message: 'Please try again later.' },
  server: { code: '500', icon: 'alert', title: 'Something went wrong', message: "We couldn't complete that. Please try again in a moment." },
};

export function ErrorState({ kind = 'server', onRetry, notFoundTitle, notFoundMessage, compact }: { kind?: Kind; onRetry?: () => void; notFoundTitle?: string; notFoundMessage?: string; compact?: boolean }) {
  const c = COPY[kind];
  const title = kind === 'notfound' && notFoundTitle ? notFoundTitle : c.title;
  const message = kind === 'notfound' && notFoundMessage ? notFoundMessage : c.message;
  return (
    <div className={`flex flex-col items-center justify-center text-center px-4 ${compact ? 'py-10' : 'py-20'}`}>
      <span className="mb-2 text-5xl font-bold text-light">{c.code}</span>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-mint text-soft"><Icon name={c.icon} size={26} /></span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      <div className="mt-6 flex gap-3">
        {kind === 'expired' ? <Button href="/login">Sign in</Button> : onRetry ? <Button onClick={onRetry} icon="refresh">Try again</Button> : <Button href="/">Go home</Button>}
      </div>
    </div>
  );
}

// Maps an ApiError to the right error state.
export function ErrorFromApi({ error, onRetry, notFoundTitle, notFoundMessage }: { error: ApiError; onRetry?: () => void; notFoundTitle?: string; notFoundMessage?: string }) {
  // 403 is shown exactly like 404 on purpose: the backend never reveals whether a record exists.
  if (isNotFound(error) || error.status === 403) return <ErrorState kind="notfound" notFoundTitle={notFoundTitle} notFoundMessage={notFoundMessage} />;
  if (error.status === 401) return <ErrorState kind="expired" />;
  if (isRateLimited(error)) return <ErrorState kind="ratelimit" onRetry={onRetry} />;
  return <ErrorState kind="server" onRetry={onRetry} />;
}

// Wraps the common loading / error / empty / content pattern for a card or section.
export function DataState({ loading, error, empty, emptyNode, onRetry, skeleton, children }: { loading: boolean; error: ApiError | null; empty?: boolean; emptyNode?: React.ReactNode; onRetry?: () => void; skeleton?: React.ReactNode; children: React.ReactNode }) {
  if (loading) return <>{skeleton ?? <TableSkeleton />}</>;
  if (error) return <Card><ErrorFromApi error={error} onRetry={onRetry} notFoundTitle="Not found" notFoundMessage="We couldn't find what you were looking for." /></Card>;
  if (empty) return <>{emptyNode}</>;
  return <>{children}</>;
}
