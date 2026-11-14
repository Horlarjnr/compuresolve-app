'use client';
import React, { useEffect, useState } from 'react';
import AuthLayout from '@/components/layout/AuthLayout';
import { Banner, Button, Input, PasswordInput } from '@/components/ui/primitives';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { passwordProblem } from '@/lib/format';

export default function AcceptInvitationPage() {
  const [token, setToken] = useState('');
  const [existing, setExisting] = useState(false);
  const [fullName, setFullName] = useState('');
  const [pw, setPw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') ?? ''), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!existing) {
      if (fullName.trim().length < 2) er.fullName = 'Enter your full name';
      const p = passwordProblem(pw);
      if (p) er.password = p;
    } else if (!pw) er.password = 'Enter your current password';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api('/invitations/accept', { method: 'POST', body: existing ? { token, password: pw } : { token, fullName: fullName.trim(), password: pw } });
      setDone(true);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err, 'This invitation is invalid or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <AuthLayout title="Invitation accepted">
        <div className="space-y-5"><Banner tone="success">Your staff access is ready. Sign in to continue.</Banner><Button href="/login" full>Sign in</Button></div>
      </AuthLayout>
    );

  return (
    <AuthLayout title="Accept your invitation" subtitle="You've been invited to join CompuResolve as staff.">
      {!token ? (
        <Banner tone="error">This invitation link is incomplete. Please use the link from your email.</Banner>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}
          {!existing && <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} error={errors.fullName} autoComplete="name" placeholder="e.g. Ada Okafor" />}
          <PasswordInput
            label={existing ? 'Your current password' : 'Choose a password'}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            error={errors.password}
            placeholder={existing ? 'Enter your current password' : 'Create a password'}
            hint={existing ? undefined : '10+ characters with upper, lower, number and symbol, or a passphrase of 3+ words.'}
            autoComplete={existing ? 'current-password' : 'new-password'}
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={existing} onChange={(e) => { setExisting(e.target.checked); setPw(''); setErrors({}); }} className="h-4 w-4 accent-[#235347]" />
            I already have a CompuResolve account with this email
          </label>
          <Button type="submit" size="lg" full loading={busy}>Accept invitation</Button>
        </form>
      )}
    </AuthLayout>
  );
}
