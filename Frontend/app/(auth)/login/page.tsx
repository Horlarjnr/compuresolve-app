'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthLayout from '@/components/layout/AuthLayout';
import { Banner, Button, TextLink, Input, PasswordInput } from '@/components/ui/primitives';
import { useAuth } from '@/components/providers/AuthProvider';
import { api, ApiError, errorMessage, isRateLimited } from '@/lib/api';
import { EMAIL_RE } from '@/lib/format';
import { ROLE_PRIORITY, ROLE_SLUG } from '@/lib/roles';

export default function LoginPage() {
  const router = useRouter();
  const { status, roles, login, expired } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    setShowExpired(new URLSearchParams(window.location.search).get('expired') === '1' || expired);
  }, [expired]);

  // Already signed in: go to the dashboard of the highest role.
  useEffect(() => {
    if (status === 'authed' && roles.length) router.replace(`/${ROLE_SLUG[ROLE_PRIORITY.find((r) => roles.includes(r))!]}/dashboard`);
  }, [status, roles, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) er.email = 'Enter a valid email address';
    if (!password) er.password = 'Enter your password';
    setErrors(er);
    setFormError('');
    setUnverified(false);
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // the effect above redirects once the session is loaded
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setUnverified(true);
      else setFormError(isRateLimited(err) ? 'Too many attempts. Please try again later.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await api('/auth/resend-verification', { method: 'POST', body: { email: email.trim().toLowerCase() } });
      setResent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your CompuResolve account." footer={<>New student? <TextLink href="/register">Create an account</TextLink></>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        {showExpired && <Banner tone="warn">Your session expired. Please sign in again.</Banner>}
        {formError && <Banner tone="error">{formError}</Banner>}
        {unverified && (
          <Banner tone="warn">
            Please verify your email before signing in. {resent ? 'We sent a new link if the address is registered.' : <button type="button" onClick={resend} className="font-medium underline">Resend the verification email</button>}
          </Banner>
        )}
        <Input label="Email" icon="mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="you@example.com" />
        <PasswordInput label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} placeholder="Your password" />
        <div className="text-right"><TextLink href="/forgot-password" className="text-sm">Forgot password?</TextLink></div>
        <Button type="submit" size="lg" full loading={busy}>Sign in</Button>
      </form>
    </AuthLayout>
  );
}
