import Link from 'next/link';

// Logo: the supplied C-mark image plus a live Poppins wordmark ("Compu" dark green, "Resolve" green).
export default function Logo({
  size = 36,
  variant = 'light',
  href = '/',
  mark = false,
}: {
  size?: number;
  variant?: 'light' | 'dark';
  href?: string | null;
  mark?: boolean;
}) {
  const inner = (
    <span className="inline-flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.png" alt="" width={size} height={size} style={{ height: size, width: 'auto' }} />
      {!mark && (
        <span className="font-bold tracking-tight leading-none" style={{ fontSize: size * 0.62 }}>
          <span className={variant === 'dark' ? 'text-white' : 'text-forest'}>Compu</span>
          <span className={variant === 'dark' ? 'text-light' : 'text-[#22A453]'}>Resolve</span>
        </span>
      )}
    </span>
  );
  return href ? (
    <Link href={href} aria-label="CompuResolve home">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export const TAGLINE = 'Every Voice Matters. Every Issue Deserves Resolution.';
