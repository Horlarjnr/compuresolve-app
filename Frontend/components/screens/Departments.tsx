'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Banner, Button, Card, ConfirmDialog, Input, Modal, PageHeader, Pill } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { asList } from '@/lib/util';

export default function Departments() {
  const toast = useToast();
  const { refresh } = useAuth();
  const { data, loading, error, refetch } = useFetch<any>('/departments/all');
  const rows = asList(data);

  // The API has no "who is the HOD" endpoint, so look at each department's staff list.
  const [hods, setHods] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        rows.map(async (d) => {
          try {
            const res = await api<any>(`/departments/${d.id}/members`, { query: { limit: 100 } });
            const hod = asList(res.data).find((m: any) => m.role === 'HOD' && m.status === 'ACTIVE');
            out[d.id] = hod?.user?.fullName ?? '';
          } catch {
            out[d.id] = '';
          }
        }),
      );
      if (alive) setHods(out);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<any>(null);

  const create = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 3) e.name = 'Department name is too short';
    if (!/^[A-Za-z0-9]{2,10}$/.test(code.trim())) e.code = 'Use 2-10 letters or digits';
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await api('/departments', { method: 'POST', body: { name: name.trim(), code: code.trim().toUpperCase() } });
      toast.success('Department created');
      setOpen(false);
      setName('');
      setCode('');
      refetch();
      refresh();
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      await api(`/departments/${target.id}/${target.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
      toast.success(target.isActive ? 'Department deactivated' : 'Department reactivated');
      setTarget(null);
      refetch();
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Departments" subtitle="Each department is its own tenant." action={<Button icon="plus" onClick={() => { setErrors({}); setFormError(''); setOpen(true); }}>New department</Button>} />
      <Card pad={false}>
        <div className="p-4 sm:p-5">
          <DataState loading={loading} error={error} onRetry={refetch} empty={rows.length === 0} emptyNode={<EmptyState icon="building" title="No departments" message="Create the first department." />}>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="pb-3 pr-4 font-medium">Department</th>
                    <th className="pb-3 pr-4 font-medium">Code</th>
                    <th className="pb-3 pr-4 font-medium">Head of Department</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="border-b border-line/60 last:border-0">
                      <td className="py-3.5 pr-4 font-medium text-ink">{d.name}</td>
                      <td className="py-3.5 pr-4 text-muted">{d.code}</td>
                      <td className="py-3.5 pr-4">{hods[d.id] ? hods[d.id] : <span className="text-muted">{d.id in hods ? 'No active HOD' : '…'}</span>}</td>
                      <td className="py-3.5 pr-4"><Pill tone={d.isActive ? 'green' : 'gray'}>{d.isActive ? 'Active' : 'Inactive'}</Pill></td>
                      <td className="py-3.5 text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="ghost" href={`/admin/staff?dept=${d.id}`}>Staff</Button>
                          <Button size="sm" variant="secondary" onClick={() => setTarget(d)}>{d.isActive ? 'Deactivate' : 'Reactivate'}</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-3 md:hidden">
              {rows.map((d) => (
                <li key={d.id} className="rounded-xl border border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{d.name}</p>
                      <p className="text-xs text-muted">{d.code} · {hods[d.id] || 'No active HOD'}</p>
                    </div>
                    <Pill tone={d.isActive ? 'green' : 'gray'}>{d.isActive ? 'Active' : 'Inactive'}</Pill>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="ghost" href={`/admin/staff?dept=${d.id}`}>Staff</Button>
                    <Button size="sm" variant="secondary" onClick={() => setTarget(d)}>{d.isActive ? 'Deactivate' : 'Reactivate'}</Button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-muted">To add a head of department, <Link href="/admin/invitations" className="font-medium text-soft hover:underline">send an invitation</Link>.</p>
          </DataState>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New department" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={create}>Create department</Button></>}>
        <div className="space-y-4">
          {formError && <Banner tone="error">{formError}</Banner>}
          <Input label="Department name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} placeholder="e.g. Department of Software Engineering" />
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} error={errors.code} hint="2-10 letters or digits, e.g. SWE" maxLength={10} placeholder="SWE" />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={toggle}
        loading={busy}
        danger={!!target?.isActive}
        title={target?.isActive ? 'Deactivate department?' : 'Reactivate department?'}
        confirmLabel={target?.isActive ? 'Deactivate' : 'Reactivate'}
        message={target?.isActive ? <><strong>{target?.name}</strong> will no longer appear on the registration form.</> : <><strong>{target?.name}</strong> will be available again.</>}
      />
    </>
  );
}
