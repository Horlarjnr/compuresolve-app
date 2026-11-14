'use client';
import React, { useState } from 'react';
import { Banner, Button, Card, Input, Modal, PageHeader, Pill, Select, Tabs } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { asList } from '@/lib/util';
import { useDepartmentChoice } from './Staff';

export default function Categories({ slug }: { slug: string }) {
  const isAdmin = slug === 'admin';
  const { departmentName } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState(isAdmin ? 'FACULTY' : 'DEPARTMENT');
  const { departments, deptId, setChosen } = useDepartmentChoice(isAdmin);
  const scope = tab;
  const needsDept = scope === 'DEPARTMENT';
  const query: Record<string, any> = { includeInactive: true, scope, ...(needsDept && deptId ? { departmentId: deptId } : {}) };
  const { data, loading, error, refetch } = useFetch<any>('/categories', { query, enabled: !needsDept || !!deptId });
  const rows = asList(data).filter((c: any) => c.scope === scope);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameErr, setNameErr] = useState('');
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (name.trim().length < 2) return setNameErr('Category name is too short');
    setBusy(true);
    setNameErr('');
    setFormError('');
    try {
      await api('/categories', { method: 'POST', body: { name: name.trim(), scope, ...(needsDept ? { departmentId: deptId } : {}) } });
      toast.success('Category added');
      setOpen(false);
      setName('');
      refetch();
    } catch (e) {
      setNameErr(fieldErrors(e).name || '');
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: any) => {
    try {
      await api(`/categories/${c.id}/${c.isActive ? 'deactivate' : 'reactivate'}`, { method: 'POST' });
      toast.success(c.isActive ? 'Category deactivated' : 'Category reactivated');
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Complaint categories" subtitle="Categories are never deleted. Deactivate one to stop it being used for new complaints." action={<Button icon="plus" onClick={() => { setNameErr(''); setFormError(''); setOpen(true); }}>Add category</Button>} />
      {isAdmin && (
        <div className="mb-4">
          <Tabs tabs={[{ value: 'FACULTY', label: 'Faculty level' }, { value: 'DEPARTMENT', label: 'By department' }]} value={tab} onChange={setTab} />
        </div>
      )}
      {isAdmin && needsDept && (
        <div className="mb-4 max-w-sm">
          <Select label="Department" value={deptId} onChange={(e) => setChosen(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
      )}
      <Card pad={false}>
        <div className="p-4 sm:p-5">
          <DataState loading={loading} error={error} onRetry={refetch} empty={rows.length === 0} emptyNode={<EmptyState icon="tag" title="No categories yet" message="Add the first category so complaints can be filed under it." />}>
            <ul className="divide-y divide-line">
              {rows.map((c: any) => (
                <li key={c.id} className="flex items-center gap-3 py-3.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
                  <Pill tone={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Active' : 'Inactive'}</Pill>
                  <Button size="sm" variant="secondary" onClick={() => toggle(c)}>{c.isActive ? 'Deactivate' : 'Reactivate'}</Button>
                </li>
              ))}
            </ul>
          </DataState>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add category" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={busy} onClick={create}>Add category</Button></>}>
        <div className="space-y-4">
          {formError && !nameErr && <Banner tone="error">{formError}</Banner>}
          <Input label="Category name" value={name} onChange={(e) => setName(e.target.value)} error={nameErr} maxLength={80} autoFocus placeholder="e.g. Course Registration" />
          <p className="text-xs text-muted">{needsDept ? `For ${isAdmin ? departments.find((d) => d.id === deptId)?.name ?? 'the selected department' : departmentName(deptId)}` : 'Available to every department and to faculty-level complaints.'}</p>
        </div>
      </Modal>
    </>
  );
}
