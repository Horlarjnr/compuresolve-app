'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { ROLE_PRIORITY, ROLE_SLUG, Role } from '@/lib/roles';

type AuthStatus = 'loading' | 'authed' | 'anon';

type AuthCtx = {
  status: AuthStatus;
  user: any | null;
  roles: Role[];
  activeRole: Role | null;
  setActiveRole: (r: Role) => void;
  homePath: (role?: Role | null) => string;
  departmentId: string | null; // the user's department for the active role (null for faculty admin)
  departmentName: (id?: string | null) => string;
  expired: boolean;
  login: (email: string, password: string) => Promise<any>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>(null as any);
export const useAuth = () => useContext(Ctx);

const ROLE_KEY = 'cr_active_role'; // UI preference only. Never a credential.

const unwrapUser = (d: any) => (d && d.user ? d.user : d);

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<any | null>(null);
  const [expired, setExpired] = useState(false);
  const [pref, setPref] = useState<Role | null>(null);
  const [departments, setDepartments] = useState<any[]>([]);

  const roles: Role[] = useMemo(() => {
    const r: Role[] = (user?.roles ?? []).filter((x: string): x is Role => ROLE_PRIORITY.includes(x as Role));
    return ROLE_PRIORITY.filter((x) => r.includes(x));
  }, [user]);

  const activeRole: Role | null = useMemo(() => (pref && roles.includes(pref) ? pref : roles[0] ?? null), [pref, roles]);

  const loadDepartments = useCallback(async (u: any) => {
    try {
      const isAdmin = (u?.roles ?? []).includes('FACULTY_ADMIN');
      const res = await api<any[]>(isAdmin ? '/departments/all' : '/departments');
      setDepartments(Array.isArray(res.data) ? res.data : []);
    } catch {
      setDepartments([]);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await api('/auth/me');
      const u = unwrapUser(res.data);
      setUser(u);
      setStatus('authed');
      setExpired(false);
      loadDepartments(u);
    } catch (e) {
      setUser(null);
      setStatus('anon');
      if (e instanceof ApiError && e.status !== 401 && e.status !== 403) {
        /* server unreachable etc. is handled by pages; treat as signed out */
      }
    }
  }, [loadDepartments]);

  useEffect(() => {
    try {
      setPref((localStorage.getItem(ROLE_KEY) as Role) || null);
    } catch {}
    refresh();
  }, [refresh]);

  // Any API call that comes back 401 after sign-in means the session expired.
  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      setStatus('anon');
      setExpired(true);
    };
    window.addEventListener('cr:unauthorized', onUnauthorized);
    return () => window.removeEventListener('cr:unauthorized', onUnauthorized);
  }, []);

  const setActiveRole = useCallback((r: Role) => {
    setPref(r);
    try {
      localStorage.setItem(ROLE_KEY, r);
    } catch {}
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api('/auth/login', { method: 'POST', body: { email, password } });
      // Re-read the session so we hold exactly what the server holds.
      await refresh();
      return unwrapUser(res.data);
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    setUser(null);
    setStatus('anon');
    setExpired(false);
  }, []);

  const homePath = useCallback((role?: Role | null) => `/${ROLE_SLUG[(role ?? activeRole ?? 'STUDENT') as Role]}/dashboard`, [activeRole]);

  const departmentId: string | null = useMemo(() => {
    if (!user || !activeRole || activeRole === 'FACULTY_ADMIN') return null;
    return user.memberships?.find((m: any) => m.role === activeRole)?.departmentId ?? user.memberships?.[0]?.departmentId ?? null;
  }, [user, activeRole]);

  const departmentName = useCallback(
    (id?: string | null) => {
      if (!id) return 'Faculty of Computing';
      return departments.find((d) => d.id === id)?.name ?? 'Your department';
    },
    [departments],
  );

  const value: AuthCtx = { status, user, roles, activeRole, setActiveRole, homePath, departmentId, departmentName, expired, login, logout, refresh };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
