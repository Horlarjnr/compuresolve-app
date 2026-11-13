'use client';
import React, { useEffect, useState } from 'react';
import { Avatar, Button, Card, ConfirmDialog, PageHeader, Pagination, Pill, Select } from '@/components/ui/primitives';
import { DataState, EmptyState } from '@/components/ui/States';
import { useFetch } from '@/lib/hooks';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/components/providers/AuthProvider';
import { fmtDate } from '@/lib/format';
import { asList } from '@/lib/util';

export function useDepartmentChoice(isAdmin: boolean) {
  const { departmentId } = useAuth();
  const { data } = useFetch<any>(isAdmin ? '/departments/all' : null);
  const departments = asList(data);
  const [chosen, setChosen] = useState('');
  useEffect(() => {
    if (isAdmin && !chosen && departments.length) {
      const fromUrl = new URLSearchParams(window.location.search).get('dept');
      setChosen(departments.find((d) => d.id === fromUrl)?.id ?? departments[0].id);
    }
  }, [isAdmin, departments, chosen]);
  return { departments, deptId: isAdmin ? chosen : departmentId, setChosen };
}

export default function Staff({ slug }: { slug: string }) {
  const isAdmin = slug === 'admin';
  const { user } = useAuth();
  const toast = useToast();
  const { departments, deptId, setChosen } = useDepartmentChoice(isAdmin);
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, refetch } = useFetch<any>(deptId ? `/departments/${deptId}/members` : null, { query: { page, limit: 20 }, enabled: !!deptId });
  const [target, setTarget] = useState<{ m: any; action: 'suspend' | 'reactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const rows = asList(data);

  useEffect(() => setPage(1), [deptId]);

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api(`/departments/${deptId}/members/${target.m.id}/${target.action}`, { method: 'POST' });
      toast.success(target.action === 'suspend' ? `${target.m.user.fullName} has been suspended` : `${target.m.user.fullName} has been reactivated`);
      setTarget(null);
      refetch();
    } catch (e) {
      toast.error(errorMessage(e));
      setTarget(null);
    } finally {
      setBusy(false);
    }
  };

  // A HOD may only manage officers. The admin may manage any staff. The API enforces this regardless.
  const canManage = (m: any) => m.user.id !== user?.id && (isAdmin || m.role === 'OFFICER');

  return (
    <>
      <PageHeader title="Staff management" subtitle="Officers and heads of department." action={!isAdmin ? <Button href={`/${slug}/invitations`} icon="mail">Invite officer</Button> : undefined} />
      {isAdmin && (
        <div className="mb-4 max-w-sm">
          <Select label="Department" value={deptId} onChange={(e) => setChosen(e.target.value)}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}{d.isActive ? '' : ' (inactive)'}</option>)}
          </Select>
        </div>
      )}
      <Card pad={false}>
        <div className="p-4 sm:p-5">
          <DataState loading={loading || !deptId} error={error} onRetry={refetch} empty={rows.length === 0} emptyNode={<EmptyState icon="users" title="No staff yet" message="Invite an officer to start handling complaints." action={<Button href={`/${slug}/invitations`} size="sm">Send an invitation</Button>} />}>
            <ul className="divide-y divide-line">
              {rows.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3.5">
                  <Avatar name={m.user.fullName} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{m.user.fullName}</p>
                    <p className="truncate text-xs text-muted">{m.user.email} · Joined {fmtDate(m.createdAt)}</p>
                  </div>
                  <Pill tone="gray">{m.role === 'HOD' ? 'Head of Department' : 'Officer'}</Pill>
                  <Pill tone={m.status === 'ACTIVE' ? 'green' : 'red'}>{m.status === 'ACTIVE' ? 'Active' : 'Suspended'}</Pill>
                  {canManage(m) &&
                    (m.status === 'ACTIVE' ? (
                      <Button size="sm" variant="outline-danger" icon="ban" onClick={() => setTarget({ m, action: 'suspend' })}>Suspend</Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon="refresh" onClick={() => setTarget({ m, action: 'reactivate' })}>Reactivate</Button>
                    ))}
                </li>
              ))}
            </ul>
            <Pagination page={page} totalPages={Math.ceil((meta?.total ?? 0) / (meta?.limit ?? 20))} onChange={setPage} />
          </DataState>
        </div>
      </Card>

      <ConfirmDialog
        open={!!target}
        onClose={() => setTarget(null)}
        onConfirm={confirm}
        loading={busy}
        danger={target?.action === 'suspend'}
        title={target?.action === 'suspend' ? 'Suspend this staff member?' : 'Reactivate this staff member?'}
        confirmLabel={target?.action === 'suspend' ? 'Suspend' : 'Reactivate'}
        message={target?.action === 'suspend' ? <><strong>{target?.m.user.fullName}</strong> will lose access to this department immediately. You can reactivate them later.</> : <><strong>{target?.m.user.fullName}</strong> will regain access to this department.</>}
      />
    </>
  );
}
