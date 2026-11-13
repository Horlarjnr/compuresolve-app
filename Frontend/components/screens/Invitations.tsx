'use client';
import React, { useState } from 'react';
import { Banner, Button, Card, ConfirmDialog, Input, Modal, PageHeader, Pill, Select } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { EMAIL_RE, fmtDate } from '@/lib/format';
import { asList } from '@/lib/util';

const ROLE_TEXT: Record<string, string> = { OFFICER: 'Officer', HOD: 'Head of Department', FACULTY_ADMIN: 'Faculty Admin' };
const tone = (s: string) => ({ PENDING: 'amber', ACCEPTED: 'green', REVOKED: 'red', EXPIRED: 'gray' } as any)[s?.toUpperCase()] ?? 'gray';

export default function Invitations({ slug }: { slug: string }) {
  const isAdmin = slug === 'admin';
  const { departmentId, departmentName } = useAuth();
  const toast = useToast();
  const { data, loading, error, refetch } = useFetch<any>('/invitations');
  const { data: deptData } = useFetch<any>(isAdmin ? '/departments' : null);
  const departments = asList(deptData);
  const rows = asList(data);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(isAdmin ? 'HOD' : 'OFFICER');
  const [dept, setDept] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revoke, setRevoke] = useState<any>(null);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!EMAIL_RE.test(email.trim())) e.email = 'Enter a valid email address';
    const departmentIdToSend = isAdmin ? (role === 'FACULTY_ADMIN' ? undefined : dept) : departmentId;
    if (role !== 'FACULTY_ADMIN' && !departmentIdToSend) e.departmentId = 'Select a department';
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api('/invitations', { method: 'POST', body: { email: email.trim().toLowerCase(), role, ...(departmentIdToSend ? { departmentId: departmentIdToSend } : {}) } });
      toast.success(`Invitation sent to ${email.trim()}`);
      setOpen(false);
      setEmail('');
      refetch();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const doRevoke = async () => {
    setBusy(true);
    try {
      await api(`/invitations/${revoke.id}`, { method: 'DELETE' });
      toast.success('Invitation revoked');
      setRevoke(null);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err));
      setRevoke(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Invitations" subtitle={isAdmin ? 'Invite heads of department, officers and faculty admins.' : 'Invite officers to your department.'} action={<Button icon="plus" onClick={() => { setErrors({}); setFormError(''); setOpen(true); }}>New invitation</Button>} />
      <Card pad={false}>
        <div className="p-4 sm:p-5">
          <DataState loading={loading} error={error} onRetry={refetch} empty={rows.length === 0} emptyNode={<EmptyState icon="mail" title="No invitations yet" message="Invitations you send will be listed here." />}>
            <ul className="divide-y divide-line">
              {rows.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{i.email}</p>
                    <p className="text-xs text-muted">{ROLE_TEXT[i.role] ?? i.role}{i.department ? ` · ${i.department.name}` : ''} · Sent {fmtDate(i.createdAt)}{String(i.status).toUpperCase() === 'PENDING' ? ` · Expires ${fmtDate(i.expiresAt)}` : ''}</p>
                  </div>
                  <Pill tone={tone(i.status)}>{String(i.status).charAt(0).toUpperCase() + String(i.status).slice(1).toLowerCase()}</Pill>
                  {String(i.status).toUpperCase() === 'PENDING' && <Button size="sm" variant="outline-danger" onClick={() => setRevoke(i)}>Revoke</Button>}
                </li>
              ))}
            </ul>
          </DataState>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New invitation" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={submit} icon="send">Send invitation</Button></>}>
        <div className="space-y-4">
          {formError && <Banner tone="error">{formError}</Banner>}
          <Input label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} placeholder="name@example.com" />
          {isAdmin ? (
            <>
              <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)} error={errors.role}>
                <option value="HOD">Head of Department</option>
                <option value="OFFICER">Department Officer</option>
                <option value="FACULTY_ADMIN">Faculty Admin</option>
              </Select>
              {role !== 'FACULTY_ADMIN' && (
                <Select label="Department" value={dept} onChange={(e) => setDept(e.target.value)} error={errors.departmentId}>
                  <option value="">Select a department…</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-mint/60 px-4 py-3 text-sm text-forest">Role: Department Officer · {departmentName(departmentId)}</p>
          )}
          <p className="text-xs text-muted">The invitation link is emailed and is valid for 7 days.</p>
        </div>
      </Modal>

      <ConfirmDialog open={!!revoke} onClose={() => setRevoke(null)} onConfirm={doRevoke} loading={busy} danger title="Revoke invitation?" confirmLabel="Revoke" message={<>The invitation to <strong>{revoke?.email}</strong> will stop working.</>} />
    </>
  );
}
