import React from 'react';
import Link from 'next/link';
import Logo, { TAGLINE } from '@/components/ui/Brand';
import { PUBLIC_WRAP } from './public-nav';

export { PublicHeader } from './PublicHeader';

// The one footer used by every public page.
export function PublicFooter() {
  return (
    <footer className="bg-white">
      <div className={`${PUBLIC_WRAP} grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]`}>
        <div>
          <Logo size={36} />
          <p className="mt-3 max-w-xs text-sm text-muted">{TAGLINE}</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-forest">Quick Links</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/" className="hover:text-soft">Home</Link></li>
            <li><Link href="/about" className="hover:text-soft">About</Link></li>
            <li><Link href="/#features" className="hover:text-soft">Features</Link></li>
            <li><Link href="/about" className="hover:text-soft">Contact</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-forest">Support</h4>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/about" className="hover:text-soft">FAQ</Link></li>
            <li><Link href="/about" className="hover:text-soft">Help</Link></li>
            <li><Link href="/login" className="hover:text-soft">Login</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-muted">© {new Date().getFullYear()} CompuResolve. All rights reserved.</div>
    </footer>
  );
}
