'use client';
import React, { useState } from 'react';
import { Button, Card, Input, PageHeader, Select, Textarea, Banner } from '@/components/ui/primitives';
import Icon from '@/components/ui/Icon';
import { api, errorMessage, fieldErrors } from '@/lib/api';
import { useFetch } from '@/lib/hooks';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/ui/Toast';
import { asList } from '@/lib/util';

export default function SubmitComplaint({ slug }: { slug: string }) {
  const { departmentId, departmentName } = useAuth();
  const toast = useToast();
  const { data: cats, loading } = useFetch<any>('/categories');
  const [target, setTarget] = useState<'DEPARTMENT' | 'FACULTY'>('DEPARTMENT');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);

  const categories = asList(cats).filter((c: any) => c.isActive !== false && c.scope === target);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!categoryId) e.categoryId = 'Select a category';
    if (title.trim().length < 5) e.title = 'Title must be at least 5 characters';
    if (title.trim().length > 150) e.title = 'Title must be at most 150 characters';
    if (description.trim().length < 20) e.description = 'Please describe the problem in more detail (at least 20 characters)';
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError('');
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await api('/complaints', {
        method: 'POST',
        body: { target, categoryId, title: title.trim(), description: description.trim(), ...(target === 'DEPARTMENT' && departmentId ? { departmentId } : {}) },
      });
      setDone(res.data);
      toast.success('Complaint submitted');
    } catch (err) {
      const fe = fieldErrors(err);
      if (Object.keys(fe).length) setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="text-center">
          <span className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50 text-green-600"><Icon name="check-circle" size={32} /></span>
          <h1 className="text-xl font-semibold text-ink">Complaint submitted</h1>
          <p className="mt-2 text-sm text-muted">Keep your reference number to follow up.</p>
          <p className="mx-auto mt-4 w-fit rounded-xl bg-mint px-5 py-3 text-lg font-semibold tracking-wide text-forest">{done.reference}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            {done.id && <Button href={`/${slug}/complaints/${done.id}`}>View complaint</Button>}
            <Button variant="secondary" href={`/${slug}/complaints`}>My complaints</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Submit a complaint" subtitle="Tell us what went wrong. A member of staff will review it." />
      <Card>
        <form onSubmit={submit} className="space-y-5" noValidate>
          {formError && <Banner tone="error">{formError}</Banner>}

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">Send to</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ['DEPARTMENT', 'My department', departmentName(departmentId)],
                ['FACULTY', 'Faculty level', 'Faculty of Computing'],
              ] as const).map(([v, label, sub]) => (
                <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${target === v ? 'border-soft bg-mint/50' : 'border-line bg-white'}`}>
                  <input type="radio" name="target" checked={target === v} onChange={() => { setTarget(v); setCategoryId(''); }} className="mt-1 accent-[#235347]" />
                  <span>
                    <span className="block text-sm font-medium text-ink">{label}</span>
                    <span className="block text-xs text-muted">{sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Select label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={errors.categoryId} disabled={loading}>
            <option value="">{loading ? 'Loading categories…' : 'Select a category'}</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>

          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={150} placeholder="A short summary of the problem" />

          <Textarea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} maxLength={5000} className="min-h-[180px]" placeholder="Describe what happened, when, and what you would like done." hint={`${description.length}/5000`} />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" href={`/${slug}/complaints`}>Cancel</Button>
            <Button type="submit" loading={busy} icon="send">Submit complaint</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
