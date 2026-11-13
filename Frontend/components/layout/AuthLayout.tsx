import React from 'react';
import Logo, { TAGLINE } from '@/components/ui/Brand';

// Split screen used by every auth page: brand panel on the left (desktop), form on the right.
export default function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ backgroundImage: 'linear-gradient(rgba(5,31,32,0.86), rgba(11,43,38,0.93)), url(/faculty-building.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      >
        <Logo variant="dark" size={44} />
        <div>
          <h2 className="max-w-md text-4xl font-semibold leading-tight">Every voice matters.<br />Every issue deserves resolution.</h2>
          <p className="mt-4 max-w-md text-sm text-mint/80">The Faculty of Computing's complaint resolution platform. Raise an issue, follow it from submission to resolution, and talk to the people handling it.</p>
        </div>
        <p className="text-xs text-mint/60">© {new Date().getFullYear()} CompuResolve · Faculty of Computing</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo size={36} /></div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          <p className="sr-only">{TAGLINE}</p>
        </div>
      </main>
    </div>
  );
}
