'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import AuthLayout from '@/components/layout/AuthLayout';
import { Banner, Button, Input, PasswordInput, Select } from '@/components/ui/primitives';
import Icon from '@/components/ui/Icon';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { EMAIL_RE, passwordProblem } from '@/lib/format';
import { asList } from '@/lib/util';

const LEVELS = [100, 200, 300, 400, 500];

export default function RegisterPage() {
  const { data } = useFetch<any>('/departments');
  const departments = asList(data);
  const [f, setF] = useState({ fullName: '', email: '', matricNumber: '', departmentId: '', level: '', password: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [resent, setResent] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (f.fullName.trim().length < 2) er.fullName = 'Enter your full name';
    if (!EMAIL_RE.test(f.email.trim())) er.email = 'Enter a valid email address';
    if (!/^[A-Za-z]{3}\/\d{4}\/\d{3}$/.test(f.matricNumber.trim())) er.matricNumber = 'Matric number must look like ABC/1234/567';
    if (!f.departmentId) er.departmentId = 'Select your department';
    if (!f.level) er.level = 'Select your level';
    const pp = passwordProblem(f.password);
    if (pp) er.password = pp;
    if (f.confirm !== f.password) er.confirm = 'Passwords do not match';
    setErrors(er);
    setFormError('');
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await api('/auth/register', { method: 'POST', body: { fullName: f.fullName.trim(), email: f.email.trim().toLowerCase(), password: f.password, matricNumber: f.matricNumber.trim().toUpperCase(), departmentId: f.departmentId, level: Number(f.level) } });
      setSentTo(f.email.trim().toLowerCase());
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    try {
      await api('/auth/resend-verification', { method: 'POST', body: { email: sentTo } });
      setResent(true);
    } catch (err) {
      setFormError(errorMessage(err));
    }
  };

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={`We sent a verification link to ${sentTo}.`}>
        <div className="space-y-5 text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mint text-soft"><Icon name="mail" size={28} /></span>
          <p className="text-sm text-muted">Open the link in the email to activate your account. It is valid for 24 hours.</p>
          {formError && <Banner tone="error">{formError}</Banner>}
          {resent ? <Banner tone="success">If the address is registered, a new link is on its way.</Banner> : <Button variant="secondary" onClick={resend} full>Resend email</Button>}
          <Button href="/login" full>Go to sign in</Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your account" subtitle="Student accounts only. Staff join by invitation." footer={<>Already registered? <Link href="/login" className="font-medium text-soft hover:underline">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Banner tone="error">{formError}</Banner>}
        <Input label="Full name" value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" />
        <Input label="Email" type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" />
        <Input label="Matric number" value={f.matricNumber} onChange={set('matricNumber')} error={errors.matricNumber} placeholder="CSC/2021/045" />
        <Select label="Department" value={f.departmentId} onChange={set('departmentId')} error={errors.departmentId}>
          <option value="">Select your department</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select label="Level" value={f.level} onChange={set('level')} error={errors.level}>
          <option value="">Select your level</option>
          {LEVELS.map((l) => <option key={l} value={l}>{l} level</option>)}
        </Select>
        <PasswordInput label="Password" value={f.password} onChange={set('password')} error={errors.password} hint="10+ characters with upper, lower, number and symbol, or a passphrase of 3+ words." autoComplete="new-password" />
        <PasswordInput label="Confirm password" value={f.confirm} onChange={set('confirm')} error={errors.confirm} autoComplete="new-password" />
        <Button type="submit" size="lg" full loading={busy}>Create account</Button>
      </form>
    </AuthLayout>
  );
}
