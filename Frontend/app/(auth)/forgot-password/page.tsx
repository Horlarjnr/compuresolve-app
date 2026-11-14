'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/layout/AuthLayout';
import { Banner, Button, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { EMAIL_RE } from '@/lib/format';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address');
    setError('');
    setBusy(true);
    try {
      await api('/auth/forgot-password', { method: 'POST', body: { email: email.trim().toLowerCase() } });
      setSent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link." footer={<Link href="/login" className="font-medium text-soft hover:underline">Back to sign in</Link>}>
      {sent ? (
        <Banner tone="success">If that email is registered, a reset link is on its way. It is valid for 1 hour.</Banner>
      ) : (
        <form onSubmit={submit} className="space-y-5" noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}
          <Input label="Email" icon="mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} autoComplete="email" placeholder="you@example.com" />
          <Button type="submit" size="lg" full loading={busy}>Send reset link</Button>
        </form>
      )}
    </AuthLayout>
  );
}
