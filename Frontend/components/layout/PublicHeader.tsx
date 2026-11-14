'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from '@/components/ui/Brand';
import Icon from '@/components/ui/Icon';
import { Button, cx } from '@/components/ui/primitives';
import { PUBLIC_NAV, PUBLIC_WRAP } from './public-nav';

// The one header used by every public page.
//  - variant "solid":   white sticky bar (About page).
//  - variant "overlay": transparent bar that sits on top of the dark hero (landing page).
// Desktop: logo, links, Login and Get started. Mobile: logo, Login and a menu button, so nothing can overlap.
export function PublicHeader({ variant = 'solid' }: { variant?: 'solid' | 'overlay' }) {
  const overlay = variant === 'overlay';
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={cx(overlay ? 'relative z-20 border-b border-white/10' : 'sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur')}>
      <div className={cx(PUBLIC_WRAP, 'flex h-[72px] items-center justify-between gap-3')}>
        <span className="shrink-0 sm:hidden"><Logo variant={overlay ? 'dark' : 'light'} size={28} /></span>
        <span className="hidden shrink-0 sm:block"><Logo variant={overlay ? 'dark' : 'light'} size={36} /></span>

        <div className="flex items-center gap-2 sm:gap-3 lg:gap-8">
          <nav className="hidden items-center gap-6 text-sm font-medium lg:flex lg:gap-8" aria-label="Main">
            {PUBLIC_NAV.map((n) => (
              <Link
                key={n.label}
                href={n.href}
                aria-current={pathname === n.href ? 'page' : undefined}
                className={cx('whitespace-nowrap', overlay ? 'text-white/90 hover:text-light' : 'text-ink hover:text-soft', pathname === n.href && 'font-semibold')}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <Button href="/login" size="sm" variant={overlay ? 'brand' : 'secondary'} className="sm:h-10 sm:px-5">Login</Button>
          <Button href="/register" size="sm" variant={overlay ? 'outline-light' : 'primary'} className="hidden sm:inline-flex sm:h-10 sm:px-5">Get started</Button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="public-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className={cx('flex h-10 w-10 items-center justify-center rounded-xl lg:hidden', overlay ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-mint/60')}
          >
            <Icon name={open ? 'x' : 'menu'} />
          </button>
        </div>
      </div>

      {open && (
        <div id="public-menu" className="absolute right-3 top-full z-40 mt-2 w-60 rounded-2xl bg-white p-2 text-ink shadow-pop sm:right-6 lg:hidden">
          <nav aria-label="Menu">
            {PUBLIC_NAV.map((n) => (
              <Link key={n.label} href={n.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-mint/60">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-1 border-t border-line p-2 sm:hidden">
            <Button href="/register" full>Get started</Button>
          </div>
        </div>
      )}
    </header>
  );
}
