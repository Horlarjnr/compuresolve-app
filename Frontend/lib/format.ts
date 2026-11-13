export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export const fmtDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

export const fmtRelative = (iso?: string | null) => {
  if (!iso) return '';
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(iso);
};

export const initials = (name?: string) =>
  (name || '?')
    .replace(/^(Dr|Prof|Mr|Mrs|Ms)\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

// Backend stores level as "L300".
export const fmtLevel = (level?: string | null) => (level ? level.replace(/^L/, '') : '');

// Password rule from the API docs: 10-72 chars with upper, lower, number, symbol; or 3+ words and 16+ chars.
export const passwordProblem = (pw: string): string | null => {
  if (pw.length < 10) return 'Use at least 10 characters';
  if (pw.length > 72) return 'Use at most 72 characters';
  const complex = /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  const passphrase = pw.length >= 16 && pw.trim().split(/\s+/).length >= 3;
  return complex || passphrase ? null : 'Use upper and lower case, a number and a symbol, or a passphrase of 3+ words (16+ characters)';
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
