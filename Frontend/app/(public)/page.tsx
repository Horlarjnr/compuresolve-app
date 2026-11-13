import Link from 'next/link';
import type { CSSProperties } from 'react';
import Logo, { TAGLINE } from '@/components/ui/Brand';
import Icon from '@/components/ui/Icon';

const NAV = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Features', href: '/#features' },
  { label: 'How It Works', href: '/#how' },
  { label: 'FAQ', href: '/about' },
  { label: 'Contact', href: '/about' },
];

const FEATURES = [
  { icon: 'users', title: 'Multi-Tenant', text: 'Separate departments, secure access.' },
  { icon: 'shield', title: 'Role-Based Access', text: 'Right people, right permissions.' },
  { icon: 'eye', title: 'Transparent Tracking', text: 'Real-time updates and history.' },
  { icon: 'lock', title: 'Secure & Reliable', text: 'Your data, our priority.' },
];

const STEPS = [
  { icon: 'edit', title: '1. Submit', text: 'File your complaint in minutes.' },
  { icon: 'search', title: '2. Track', text: 'Monitor progress in real-time.' },
  { icon: 'check-circle', title: '3. Resolve', text: 'Get updates and see the outcome.' },
  { icon: 'chart', title: '4. Improve', text: 'A better faculty for everyone.' },
];

const GREEN_BTN = 'bg-gradient-to-r from-[#8EB69B] to-[#4FC47F] text-deep hover:brightness-110';
// Backgrounds run 100% of the browser width; content sits in this centred container.
const WRAP = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10';

const fadeLeft: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.55) 20%, #000 46%)',
  maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.55) 20%, #000 46%)',
};
const fadeTop: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 40%)',
  maskImage: 'linear-gradient(to bottom, transparent 0%, #000 40%)',
};
const studentsMask: CSSProperties = {
  WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%), linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)',
  maskImage: 'linear-gradient(to bottom, transparent 0%, #000 16%), linear-gradient(to right, transparent 0%, #000 12%, #000 88%, transparent 100%)',
  WebkitMaskComposite: 'source-in',
  maskComposite: 'intersect',
};

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-page">
      {/* ================= Nav + hero (full width) ================= */}
      <section id="top" className="relative overflow-hidden bg-gradient-to-br from-deep via-forest to-teal text-white">
        <div className="pointer-events-none absolute -left-24 bottom-0 h-96 w-96 rounded-full bg-soft/25 blur-3xl" />

        {/* Building photo: right half of the browser window, fading into the green */}
        <div className="absolute inset-y-0 right-0 hidden w-[56%] md:block" style={fadeLeft}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/faculty-building.jpg" alt="The Faculty of Computing building" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-forest/25" />
        </div>
        {/* Curved light-green sweep along the photo's left edge */}
        <svg className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[60%] md:block" viewBox="0 0 620 440" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#8EB69B" stopOpacity="0.38" />
              <stop offset="1" stopColor="#8EB69B" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M270 0 C150 110 110 300 215 440 L300 440 C210 310 235 120 360 0 Z" fill="url(#sweep)" />
          <path d="M270 0 C150 110 110 300 215 440" fill="none" stroke="#8EB69B" strokeOpacity="0.45" strokeWidth="1.5" />
        </svg>

        {/* ---- Nav bar ---- */}
        <header className="relative z-20 border-b border-white/10">
          <div className={`${WRAP} flex h-[76px] items-center justify-between`}>
            <span className="sm:hidden"><Logo variant="dark" size={28} /></span>
            <span className="hidden sm:block"><Logo variant="dark" size={36} /></span>
            <div className="flex items-center gap-3 sm:gap-6 lg:gap-9">
              <nav className="hidden items-center gap-6 text-sm font-medium text-white/90 lg:flex lg:gap-8" aria-label="Main">
                {NAV.map((n) => (
                  <Link key={n.label} href={n.href} className="whitespace-nowrap hover:text-light">{n.label}</Link>
                ))}
              </nav>
              <Link href="/login" className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-semibold sm:h-10 sm:px-6 ${GREEN_BTN}`}>Login</Link>
              <details className="relative lg:hidden">
                <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-white hover:bg-white/10 [&::-webkit-details-marker]:hidden" aria-label="Open menu">
                  <Icon name="menu" />
                </summary>
                <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-white p-2 text-ink shadow-pop">
                  {NAV.map((n) => (
                    <Link key={n.label} href={n.href} className="block rounded-xl px-4 py-2.5 text-sm font-medium hover:bg-mint/60">{n.label}</Link>
                  ))}
                </div>
              </details>
            </div>
          </div>
        </header>

        {/* ---- Hero ---- */}
        <div className={`${WRAP} relative z-10 pb-12 pt-10 md:flex md:min-h-[480px] md:items-center md:pb-20 md:pt-16`}>
          <div className="md:max-w-[46%]">
            <h1 className="text-[1.95rem] font-bold leading-[1.15] sm:text-5xl lg:text-[3.25rem]">
              Your Voice Matters.<br />We&apos;re Here to <span className="text-[#6FD79A]">Resolve</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">
              The Faculty of Computing complaint resolution system for students, staff and administrators. Submit, track and resolve complaints quickly and transparently.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={`inline-flex h-12 items-center rounded-lg px-8 text-sm font-semibold ${GREEN_BTN}`}>Get Started</Link>
              <Link href="/about" className="inline-flex h-12 items-center rounded-lg border border-white/60 px-8 text-sm font-semibold text-white hover:bg-white/10">Learn More</Link>
            </div>
          </div>
        </div>

        {/* Mobile: photo below the text, fading in from the green */}
        <div className="relative h-56 md:hidden" style={fadeTop}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/faculty-building.jpg" alt="The Faculty of Computing building" className="h-full w-full object-cover" />
        </div>
      </section>

      {/* ================= Feature strip (full width) ================= */}
      <section id="features" className="border-b border-line bg-white">
        <div className={`${WRAP} grid grid-cols-2 lg:grid-cols-4`}>
          {FEATURES.map((f, i) => (
            <div
              key={f.title}
              className={`flex flex-col items-center px-3 py-8 text-center ${i % 2 === 1 ? 'border-l border-line' : ''} ${i > 0 ? 'lg:border-l lg:border-line' : ''} ${i >= 2 ? 'border-t border-line lg:border-t-0' : ''}`}
            >
              <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-mint text-soft">
                <Icon name={f.icon} size={24} />
              </span>
              <h3 className="text-sm font-semibold text-forest sm:text-base">{f.title}</h3>
              <p className="mt-1 text-xs text-muted sm:text-sm">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= How it works ================= */}
      <section id="how" className="bg-page py-14 sm:py-16">
        <div className={WRAP}>
          <h2 className="text-2xl font-bold text-forest sm:text-3xl">How It Works</h2>
          <p className="mt-1.5 text-sm text-muted sm:text-base">A simple process to ensure your concerns are heard and resolved.</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.title} className="rounded-2xl bg-white p-6 shadow-card">
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-mint text-soft">
                  <Icon name={s.icon} size={22} />
                </span>
                <h3 className="font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ================= Call to action (full width) ================= */}
      <section className="relative overflow-hidden bg-gradient-to-r from-deep via-forest to-teal text-white">
        <svg className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-[40%] sm:block" viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden="true">
          <path d="M400 0 C300 40 230 120 260 260 L400 260 Z" fill="#8EB69B" fillOpacity="0.14" />
          <path d="M400 30 C320 70 270 140 290 260" fill="none" stroke="#8EB69B" strokeOpacity="0.35" strokeWidth="1.5" />
        </svg>
        <div className={`${WRAP} relative grid items-center sm:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] sm:gap-6`}>
          <div className="relative -mx-5 h-56 sm:mx-0 sm:h-full sm:min-h-[280px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/cta-students.webp" alt="Three smiling CompuResolve students" className="absolute inset-0 h-full w-full object-cover object-top" style={studentsMask} />
          </div>
          <div className="flex flex-col items-start gap-6 py-10 sm:flex-row sm:items-center sm:justify-between sm:py-12">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Together for a Better Computing Faculty</h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85 sm:text-base">Your feedback helps us build a more responsive, transparent and supportive academic environment.</p>
            </div>
            <Link href="/register" className={`inline-flex h-12 shrink-0 items-center rounded-lg px-8 text-sm font-semibold ${GREEN_BTN}`}>Get Started</Link>
          </div>
        </div>
      </section>

      {/* ================= Footer ================= */}
      <footer className="bg-white">
        <div className={`${WRAP} grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]`}>
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
    </div>
  );
}
