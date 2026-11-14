'use client';
import React, { useState } from 'react';
import { Avatar, Banner, Button, Card, CardHeader, PageHeader, PasswordInput } from '@/components/ui/primitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { fmtLevel, passwordProblem } from '@/lib/format';
import { ROLE_LABEL, SLUG_ROLE } from '@/lib/roles';

// Read-only profile (the backend has no update-profile endpoint) + change password (which it does have).
export default function Profile({ slug }: { slug: string }) {
  const { user, departmentName, departmentId } = useAuth();
  const toast = useToast();
  const role = SLUG_ROLE[slug];
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const rows: [string, string | undefined][] = [
    ['Full name', user?.fullName],
    ['Email', user?.email],
    ['Role', ROLE_LABEL[role]],
    ...(role === 'FACULTY_ADMIN' ? ([['Faculty', 'Faculty of Computing']] as [string, string][]) : ([['Department', departmentName(departmentId)]] as [string, string][])),
    ...(role === 'STUDENT'
      ? ([
          ['Matric number', user?.matricNumber],
          ['Level', fmtLevel(user?.studentProfile?.level)],
        ] as [string, string | undefined][])
      : []),
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!current) er.currentPassword = 'Enter your current password';
    const p = passwordProblem(next);
    if (p) er.newPassword = p;
    else if (next === current) er.newPassword = 'New password must be different from the current one';
    if (confirm !== next) er.confirm = 'Passwords do not match';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: next } });
      toast.success('Password changed. Other devices have been signed out.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Profile" subtitle="Your account information." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <div className="mb-6 flex items-center gap-4">
              <Avatar name={user?.fullName} size={64} />
              <div>
                <p className="text-lg font-semibold text-ink">{user?.fullName}</p>
                <p className="text-sm text-muted">{ROLE_LABEL[role]}</p>
              </div>
            </div>
            <dl className="divide-y divide-line">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-sm text-muted">{k}</dt>
                  <dd className="break-all text-sm font-medium text-ink sm:text-right">{v || '—'}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted">Profile details are managed by the faculty and can't be edited here.</p>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader title="Change password" subtitle="You'll stay signed in here; other devices are signed out." />
            <form onSubmit={submit} className="space-y-4" noValidate>
              {formError && <Banner tone="error">{formError}</Banner>}
              <PasswordInput label="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors.currentPassword} autoComplete="current-password" placeholder="Enter your current password" />
              <PasswordInput label="New password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.newPassword} placeholder="Create a new password" hint="10+ characters with upper, lower, number and symbol, or a passphrase of 3+ words." autoComplete="new-password" />
              <PasswordInput label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" placeholder="Re-enter your new password" />
              <Button type="submit" loading={busy} full>Update password</Button>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}
