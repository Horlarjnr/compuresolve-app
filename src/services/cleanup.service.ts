import { prisma } from '../utils/prisma';

const DAY_MS = 86_400_000;

// Removes data that has no further use. Safe to run any number of times (for example once a day).
//  - sessions: as soon as they have expired
//  - verification and reset tokens: 7 days after they expired or were used (kept briefly for troubleshooting)
// Invitations, complaints, history and audit logs are NEVER touched here.
export const cleanupExpired = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - 7 * DAY_MS);
  const oldToken = { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] };

  const [sessions, verification, reset] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerificationToken.deleteMany({ where: oldToken }),
    prisma.passwordResetToken.deleteMany({ where: oldToken }),
  ]);
  return {
    sessions: sessions.count,
    emailVerificationTokens: verification.count,
    passwordResetTokens: reset.count,
  };
};
