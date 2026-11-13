import React from 'react';
import Link from 'next/link';
import Logo, { TAGLINE } from '@/components/ui/Brand';

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Logo size={34} />
        <nav className="hidden items-center gap-8 text-sm font-medium text-ink md:flex" aria-label="Main">
          <Link href="/" className="hover:text-soft">Home</Link>
          <Link href="/#features" className="hover:text-soft">Features</Link>
          <Link href="/#how" className="hover:text-soft">How it works</Link>
          <Link href="/about" className="hover:text-soft">About</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-xl px-4 py-2 text-sm font-medium text-forest hover:bg-mint/60">Sign in</Link>
          <Link href="/register" className="rounded-xl bg-forest px-4 py-2 text-sm font-medium text-white hover:bg-soft">Get started</Link>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="bg-forest text-mint/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo variant="dark" size={34} />
          <p className="mt-3 max-w-xs text-sm">{TAGLINE}</p>
        </div>
        <nav className="flex flex-wrap gap-6 text-sm" aria-label="Footer">
          <Link href="/about" className="hover:text-white">About</Link>
          <Link href="/login" className="hover:text-white">Sign in</Link>
          <Link href="/register" className="hover:text-white">Create account</Link>
        </nav>
      </div>
      <div className="border-t border-teal py-4 text-center text-xs text-mint/60">© {new Date().getFullYear()} CompuResolve · Faculty of Computing</div>
    </footer>
  );
}
