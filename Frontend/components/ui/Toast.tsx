'use client';
import React, { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon';

type Toast = { id: number; kind: 'success' | 'error'; message: string };
const Ctx = createContext<{ success: (m: string) => void; error: (m: string) => void }>({ success: () => {}, error: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, message }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = { success: (m: string) => push('success', m), error: (m: string) => push('error', m) };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-4 shadow-pop ${t.kind === 'success' ? 'border-green-200' : 'border-red-200'}`}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <Icon name={t.kind === 'success' ? 'check-circle' : 'alert-circle'} className={t.kind === 'success' ? 'text-green-600' : 'text-red-600'} />
            <p className="flex-1 text-sm text-ink">{t.message}</p>
            <button onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} aria-label="Dismiss" className="text-muted hover:text-ink"><Icon name="x" size={16} /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
