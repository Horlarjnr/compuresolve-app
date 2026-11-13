'use client';
import React, { useEffect, useRef, useState } from 'react';
import AuthLayout from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/primitives';
import Icon from '@/components/ui/Icon';
import { api, errorMessage } from '@/lib/api';

export default function VerifyEmailPage() {
  const [state, setState] = useState<'working' | 'ok' | 'fail'>('working');
  const [msg, setMsg] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // the token is single use; never send it twice (React strict mode)
    ran.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      setState('fail');
      setMsg('This verification link is incomplete.');
      return;
    }
    api('/auth/verify-email', { method: 'POST', body: { token } })
      .then(() => setState('ok'))
      .catch((e) => { setState('fail'); setMsg(errorMessage(e, 'This link is invalid or has expired.')); });
  }, []);

  return (
    <AuthLayout title={state === 'ok' ? 'Email verified' : state === 'fail' ? "We couldn't verify your email" : 'Verifying your email…'}>
      <div className="space-y-5 text-center">
        <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${state === 'fail' ? 'bg-red-50 text-red-600' : 'bg-mint text-soft'}`}>
          {state === 'working' ? <span className="cr-spin h-7 w-7 rounded-full border-2 border-current border-t-transparent" /> : <Icon name={state === 'ok' ? 'check-circle' : 'alert-circle'} size={30} />}
        </span>
        {state === 'ok' && <p className="text-sm text-muted">Your account is active. You can sign in now.</p>}
        {state === 'fail' && <p className="text-sm text-muted">{msg} Sign in to request a new verification email.</p>}
        {state !== 'working' && <Button href="/login" full>Go to sign in</Button>}
      </div>
    </AuthLayout>
  );
}
