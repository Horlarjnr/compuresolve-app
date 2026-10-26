import bcrypt from 'bcryptjs';
import { z } from 'zod';

const MIN_LENGTH = 10;
const MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes, so we refuse longer passwords

const hasMix = (v: string) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v);
// A passphrase is 16+ characters made of at least 3 words.
const isPassphrase = (v: string) => v.length >= 16 && v.trim().split(/\s+/).length >= 3;

// Rule: 10-72 bytes, AND (upper + lower + number + symbol, OR a passphrase of 3+ words and 16+ chars).
export const passwordSchema = z
  .string()
  .min(MIN_LENGTH, `Password must be at least ${MIN_LENGTH} characters`)
  .refine((v) => Buffer.byteLength(v, 'utf8') <= MAX_BYTES, 'Password is too long (72 bytes maximum)')
  .refine(
    (v) => hasMix(v) || isPassphrase(v),
    'Use uppercase, lowercase, a number and a symbol, or a passphrase of 3+ words (16+ characters)',
  );

const COST = 12;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

let dummyHash: Promise<string> | undefined;

// Compare a password to a stored hash. When there is no user (hash is null) we still do a full bcrypt
// comparison against a throwaway hash, so response time does not reveal whether an email exists.
export const verifyPassword = async (plain: string, hash: string | null | undefined): Promise<boolean> => {
  if (!hash) {
    dummyHash ??= bcrypt.hash('not-a-real-password', COST);
    await bcrypt.compare(plain, await dummyHash);
    return false;
  }
  return bcrypt.compare(plain, hash);
};
