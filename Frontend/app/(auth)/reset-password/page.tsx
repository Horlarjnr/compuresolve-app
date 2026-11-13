'use client';
import React, { useEffect, useState } from 'react';
import AuthLayout from '@/components/layout/AuthLayout';
import { Banner, Button, PasswordInput } from '@/components/ui/primitives';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { passwordProblem } from '@/lib/format';

export default function ResetPasswordPage() {
  const [token, setToken] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => setToken(new URLSearchParams(window.location.search).get('token') ?? ''), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const p = passwordProblem(pw);
    if (p) er.newPassword = p;
    if (confirm !== pw) er.confirm = 'Passwords do not match';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: pw } });
      setDone(true);
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err, 'This reset link is invalid or has expired.'));
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <AuthLayout title="Password updated">
        <div className="space-y-5">
          <Banner tone="success">Your password was changed and you've been signed out everywhere.</Banner>
          <Button href="/login" full>Sign in</Button>
        </div>
      </AuthLayout>
    );

  return (
    <AuthLayout title="Choose a new password">
      {!token ? (
        <div className="space-y-5"><Banner tone="error">This reset link is incomplete.</Banner><Button href="/forgot-password" full>Request a new link</Button></div>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}
          <PasswordInput label="New password" value={pw} onChange={(e) => setPw(e.target.value)} error={errors.newPassword} hint="10+ characters with upper, lower, number and symbol, or a passphrase of 3+ words." autoComplete="new-password" />
          <PasswordInput label="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} autoComplete="new-password" />
          <Button type="submit" size="lg" full loading={busy}>Update password</Button>
        </form>
      )}
    </AuthLayout>
  );
}
