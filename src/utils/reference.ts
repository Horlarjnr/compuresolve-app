import { randomInt } from 'node:crypto';

// No 0/O or 1/I, so a reference read aloud or copied by hand cannot be confused.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// CR-<DEPARTMENT CODE or FAC>-<YEAR>-<6 random characters>, e.g. CR-SWE-2026-K7M4PX.
// Random, not sequential, so references cannot be guessed one after another.
// Uniqueness is enforced by the database; the caller retries on the rare collision.
export const generateReference = (code: string, now = new Date()) => {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `CR-${code}-${now.getFullYear()}-${suffix}`;
};
