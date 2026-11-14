'use client';
import React, { useEffect, useId } from 'react';
import Link from 'next/link';
import Icon from './Icon';
import { STATUS_META } from '@/lib/status';

const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

// ---------- Button ----------
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline-danger' | 'brand' | 'outline-light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  icon?: string;
  href?: string;
  full?: boolean;
};
export function Button({ variant = 'primary', size = 'md', loading, icon, href, full, children, className, disabled, ...rest }: BtnProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-sm', lg: 'h-12 px-6 text-base', xl: 'h-12 px-8 text-sm font-semibold' };
  const variants = {
    primary: 'bg-forest text-white hover:bg-soft',
    secondary: 'bg-white text-forest border border-line hover:bg-mint/60',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    'outline-danger': 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
    ghost: 'text-soft hover:bg-mint/60',
    // Public pages (dark hero): green gradient call to action and a white outline button.
    brand: 'bg-gradient-to-r from-[#8EB69B] to-[#4FC47F] text-deep font-semibold hover:brightness-110',
    'outline-light': 'border border-white/60 text-white hover:bg-white/10',
  };
  const classes = cx(base, sizes[size], variants[variant], full && 'w-full', className);
  const content = (
    <>
      {loading ? <span className="cr-spin h-4 w-4 rounded-full border-2 border-current border-t-transparent" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </>
  );
  if (href) return <Link href={href} className={classes}>{content}</Link>;
  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
}

// ---------- Text link ----------
// The small green inline link used in forms, footers and card headers.
export function TextLink({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return <Link href={href} className={cx('font-medium text-soft hover:underline', className)} {...rest}>{children}</Link>;
}

// ---------- Form fields ----------
type FieldWrap = { label?: string; error?: string; hint?: string; children: React.ReactNode; htmlFor?: string };
export function FieldWrap({ label, error, hint, children, htmlFor }: FieldWrap) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={htmlFor} className="block text-sm font-medium text-ink">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
const inputCls = (error?: string) =>
  cx(
    'w-full rounded-xl border bg-white px-3.5 text-sm text-ink placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-soft/30',
    error ? 'border-red-400' : 'border-line focus:border-soft',
  );

export function Input({ label, error, hint, icon, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string; icon?: string }) {
  const id = useId();
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={id}>
      <div className="relative">
        {icon && <Icon name={icon} size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />}
        <input id={id} className={cx(inputCls(error), 'h-11', icon && 'pl-10', className)} aria-invalid={!!error} {...rest} />
      </div>
    </FieldWrap>
  );
}

export function PasswordInput({ label, error, hint, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  const [show, setShow] = React.useState(false);
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={id}>
      <div className="relative">
        <Icon name="lock" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input id={id} type={show ? 'text' : 'password'} className={cx(inputCls(error), 'h-11 pl-10 pr-11')} aria-invalid={!!error} {...rest} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink">
          <Icon name={show ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
    </FieldWrap>
  );
}

export function Select({ label, error, hint, children, className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={id}>
      <div className="relative">
        <select id={id} className={cx(inputCls(error), 'h-11 appearance-none pr-10', className)} aria-invalid={!!error} {...rest}>
          {children}
        </select>
        <Icon name="chevron-down" size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
      </div>
    </FieldWrap>
  );
}

export function Textarea({ label, error, hint, className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <FieldWrap label={label} error={error} hint={hint} htmlFor={id}>
      <textarea id={id} className={cx(inputCls(error), 'py-3 min-h-[120px] resize-y', className)} aria-invalid={!!error} {...rest} />
    </FieldWrap>
  );
}

// A search box with the magnifier icon inside. "md" sits on white cards, "sm" is the compact top-bar version.
export function SearchInput({ size = 'md', className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { size?: 'sm' | 'md' }) {
  return (
    <div className={cx('relative', className)}>
      <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input type="search" className={cx(inputCls(), 'pr-3 pl-10', size === 'sm' ? 'h-10 bg-page' : 'h-11')} {...rest} />
    </div>
  );
}

// ---------- Cards ----------
export function Card({ children, className, pad = true }: { children: React.ReactNode; className?: string; pad?: boolean }) {
  return <div className={cx('rounded-2xl border border-line bg-white shadow-card', pad && 'p-5 sm:p-6', className)}>{children}</div>;
}

export function CardHeader({ title, action, subtitle }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, icon, href, tone = 'green' }: { label: string; value: React.ReactNode; icon: string; href?: string; tone?: 'green' | 'amber' | 'red' | 'blue' | 'purple' }) {
  const tones = { green: 'bg-mint text-soft', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', blue: 'bg-blue-50 text-blue-700', purple: 'bg-purple-50 text-purple-700' };
  const body = (
    <div className="flex items-center gap-4">
      <span className={cx('flex h-12 w-12 items-center justify-center rounded-xl', tones[tone])}>
        <Icon name={icon} size={22} />
      </span>
      <div>
        <p className="text-2xl font-semibold text-ink leading-none">{value}</p>
        <p className="mt-1.5 text-xs text-muted">{label}</p>
      </div>
    </div>
  );
  const cls = 'block rounded-2xl border border-line bg-white p-4 sm:p-5 shadow-card';
  return href ? <Link href={href} className={cx(cls, 'hover:border-light transition-colors')}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ---------- Badges ----------
export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: '#6B7280' };
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', m.cls)}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

export function Pill({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'green' | 'red' | 'amber' }) {
  const t = { gray: 'bg-gray-100 text-gray-600', green: 'bg-green-50 text-green-700', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-700' };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', t[tone])}>{children}</span>;
}

export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const ini = (name || '?').replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('');
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-soft font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {ini}
    </span>
  );
}

// ---------- Modal + confirm ----------
export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; width?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-deep/50" onClick={onClose} />
      <div className={cx('relative w-full rounded-t-2xl sm:rounded-2xl bg-white shadow-pop max-h-[92vh] flex flex-col', width)}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-mint/60"><Icon name="x" size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', danger ? 'bg-red-50 text-red-600' : 'bg-mint text-soft')}>
          <Icon name={danger ? 'alert' : 'info'} size={20} />
        </span>
        <div className="text-sm text-muted leading-relaxed">{message}</div>
      </div>
    </Modal>
  );
}

// ---------- Skeletons ----------
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={cx('cr-skeleton', className)} />;
}
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-1/5" />
          <Skeleton className="h-10 w-2/5" />
          <Skeleton className="h-10 w-1/5" />
          <Skeleton className="h-10 w-1/5" />
        </div>
      ))}
    </div>
  );
}

// ---------- Pagination ----------
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="mt-5 flex items-center justify-between text-sm">
      <span className="text-muted">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" icon="chevron-left" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</Button>
        <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next <Icon name="chevron-right" size={16} /></Button>
      </div>
    </div>
  );
}

// ---------- Tabs ----------
export function Tabs({ tabs, value, onChange }: { tabs: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium -mb-px', value === t.value ? 'border-soft text-forest' : 'border-transparent text-muted hover:text-ink')}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Banner({ tone = 'info', children }: { tone?: 'info' | 'error' | 'success' | 'warn'; children: React.ReactNode }) {
  const t = { info: 'bg-mint/70 text-forest border-light/50', error: 'bg-red-50 text-red-700 border-red-200', success: 'bg-green-50 text-green-800 border-green-200', warn: 'bg-amber-50 text-amber-800 border-amber-200' };
  return <div className={cx('rounded-xl border px-4 py-3 text-sm', t[tone])} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export { cx };
