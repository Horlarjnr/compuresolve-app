'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import Logo from '@/components/ui/Brand';
import Icon from '@/components/ui/Icon';
import { Avatar, Skeleton, cx } from '@/components/ui/primitives';
import { ErrorState } from '@/components/ui/States';
import { NAV, ROLE_LABEL, ROLE_SLUG, SLUG_ROLE } from '@/lib/roles';
import { useFetch } from '@/lib/hooks';
import { api } from '@/lib/api';
import { fmtRelative } from '@/lib/format';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status, user, roles, expired, setActiveRole, logout, departmentName, departmentId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const slug = pathname.split('/')[1] || '';
  const slugRole = SLUG_ROLE[slug];
  const allowed = !!slugRole && roles.includes(slugRole);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    if (status === 'anon') router.replace(expired ? '/login?expired=1' : '/login');
  }, [status, expired, router]);

  // The URL decides which role's interface you are looking at (if you hold that role).
  useEffect(() => {
    if (allowed) setActiveRole(slugRole);
  }, [allowed, slugRole, setActiveRole]);

  useEffect(() => setDrawer(false), [pathname]);

  if (status !== 'authed' || !user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-64 bg-forest md:block" />
        <div className="flex-1 space-y-4 p-8">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  // Role-gating in the UI is a convenience. The backend still decides everything.
  if (!allowed) {
    return (
      <div className="min-h-screen bg-page">
        <ErrorState kind="notfound" notFoundTitle="Page not found" notFoundMessage="This page doesn't exist or you don't have access to it." />
      </div>
    );
  }

  const nav = NAV[slug];
  const isStudent = slug === 'student';
  const base = `/${slug}`;
  const isActive = (href: string) => pathname === `${base}/${href}` || pathname.startsWith(`${base}/${href}/`);
  // "My Complaints" for staff vs queue: keep exact matching sane when both exist.
  const roleLabel = ROLE_LABEL[slugRole];
  const subtitle = slugRole === 'FACULTY_ADMIN' ? 'Faculty of Computing' : departmentName(departmentId);

  const SidebarBody = (
    <div className="flex h-full flex-col">
      <div className="px-5 py-6">
        <Logo variant="dark" href={null} size={34} />
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Main">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={`${base}/${item.href}`}
            className={cx(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors',
              isActive(item.href) ? 'bg-soft text-white' : 'text-mint/80 hover:bg-teal hover:text-white',
            )}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <Icon name={item.icon} size={19} />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-teal p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.fullName} size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
            <p className="truncate text-xs text-light">{roleLabel}</p>
          </div>
        </div>
        <button onClick={async () => { await logout(); router.replace('/login'); }} className="mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-mint/80 hover:bg-teal hover:text-white">
          <Icon name="logout" size={18} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-page">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-forest md:block">{SidebarBody}</aside>

      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-deep/60" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-forest shadow-pop">{SidebarBody}</aside>
        </div>
      )}

      <div className="md:pl-64">
        <Topbar slug={slug} onMenu={() => setDrawer(true)} subtitle={subtitle} />
        <main className={cx('mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8', isStudent && 'pb-28 md:pb-8')}>{children}</main>
      </div>

      {isStudent && <BottomNav base={base} pathname={pathname} />}
    </div>
  );
}

function BottomNav({ base, pathname }: { base: string; pathname: string }) {
  const items = NAV.student.filter((n) => n.mobile);
  const { data: unreadMeta } = useUnread();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white md:hidden" aria-label="Student">
      <ul className="grid grid-cols-4">
        {items.map((n) => {
          const active = pathname === `${base}/${n.href}` || pathname.startsWith(`${base}/${n.href}/`);
          return (
            <li key={n.href}>
              <Link href={`${base}/${n.href}`} className={cx('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', active ? 'text-forest' : 'text-muted')}>
                <span className="relative">
                  <Icon name={n.icon} size={22} />
                  {n.href === 'notifications' && unreadMeta > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />}
                </span>
                {n.label === 'My Complaints' ? 'Complaints' : n.label}
                {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-soft" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Unread count, refreshed quietly every minute.
function useUnread() {
  const { data, meta, refetch } = useFetch<any[]>('/notifications', { query: { unread: true, limit: 1 }, interval: 60000 });
  return { data: meta?.unread ?? 0, refetch };
}

function Topbar({ slug, onMenu, subtitle }: { slug: string; onMenu: () => void; subtitle: string }) {
  const { user, roles, setActiveRole, homePath, logout } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState(false);
  const [panel, setPanel] = useState(false);
  const { data: unread, refetch } = useUnread();
  const menuRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanel(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const search = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (v.length < 2) return;
    const target = slug === 'officer' ? 'queue' : 'complaints';
    router.push(`/${slug}/${target}?q=${encodeURIComponent(v)}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-8">
      <button onClick={onMenu} className={cx('rounded-lg p-2 text-ink hover:bg-mint/60', slug === 'student' ? 'hidden' : 'md:hidden')} aria-label="Open menu">
        <Icon name="menu" />
      </button>
      <div className="md:hidden">
        <Logo size={28} href={homePath()} mark />
      </div>
      <form onSubmit={search} className="relative hidden max-w-md flex-1 sm:block" role="search">
        <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search complaints by title or reference…" className="h-10 w-full rounded-xl border border-line bg-page pl-10 pr-3 text-sm focus:border-soft focus:outline-none focus:ring-2 focus:ring-soft/30" aria-label="Search complaints" />
      </form>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <span className="hidden text-xs text-muted lg:block">{subtitle}</span>

        <div className="relative" ref={panelRef}>
          <button onClick={() => { setPanel((p) => !p); if (!panel) refetch(); }} className="relative rounded-xl p-2.5 text-ink hover:bg-mint/60" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Icon name="bell" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>
            )}
          </button>
          {panel && <NotificationPanel slug={slug} onClose={() => setPanel(false)} onChanged={refetch} />}
        </div>

        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenu((m) => !m)} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-mint/60" aria-haspopup="menu" aria-expanded={menu}>
            <Avatar name={user?.fullName} size={34} />
            <span className="hidden text-left sm:block">
              <span className="block max-w-[140px] truncate text-sm font-medium text-ink leading-tight">{user?.fullName}</span>
              <span className="block text-xs text-muted leading-tight">{ROLE_LABEL[SLUG_ROLE[slug]]}</span>
            </span>
            <Icon name="chevron-down" size={16} className="hidden text-muted sm:block" />
          </button>
          {menu && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-line bg-white p-2 shadow-pop" role="menu">
              <div className="px-3 py-2">
                <p className="truncate text-sm font-medium text-ink">{user?.fullName}</p>
                <p className="truncate text-xs text-muted">{user?.email}</p>
              </div>
              <Link href={`/${slug}/profile`} onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-mint/60" role="menuitem">
                <Icon name="user" size={18} /> My profile
              </Link>
              {roles.length > 1 && (
                <div className="my-1 border-t border-line pt-1">
                  <p className="px-3 py-1 text-xs text-muted">Switch role</p>
                  {roles.filter((r) => ROLE_SLUG[r] !== slug).map((r) => (
                    <button key={r} onClick={() => { setActiveRole(r); setMenu(false); router.push(`/${ROLE_SLUG[r]}/dashboard`); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-mint/60" role="menuitem">
                      <Icon name="refresh" size={18} /> {ROLE_LABEL[r]}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={async () => { await logout(); router.replace('/login'); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50" role="menuitem">
                <Icon name="logout" size={18} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotificationPanel({ slug, onClose, onChanged }: { slug: string; onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const { data, loading, error, refetch } = useFetch<any[]>('/notifications', { query: { limit: 6 } });
  const open = async (n: any) => {
    try {
      if (!n.readAt) await api(`/notifications/${n.id}/read`, { method: 'PATCH' });
      onChanged();
    } catch {}
    onClose();
    if (n.complaintId) router.push(`/${slug}/complaints/${n.complaintId}`);
  };
  const items = Array.isArray(data) ? data : [];
  return (
    <div className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-2xl border border-line bg-white shadow-pop">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">Notifications</h3>
        <Link href={`/${slug}/notifications`} onClick={onClose} className="text-xs font-medium text-soft hover:underline">View all</Link>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : error ? (
          <p className="p-6 text-center text-sm text-muted">Couldn't load notifications. <button className="font-medium text-soft" onClick={refetch}>Retry</button></p>
        ) : items.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">You're all caught up.</p>
        ) : (
          items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={cx('flex w-full gap-3 border-b border-line/60 px-4 py-3 text-left last:border-0 hover:bg-mint/40', !n.readAt && 'bg-mint/30')}>
              <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-soft')} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{n.title}</span>
                <span className="line-clamp-2 text-xs text-muted">{n.body}</span>
                <span className="mt-0.5 block text-[11px] text-muted">{fmtRelative(n.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
