import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { cleanupExpired } from '../../src/services/cleanup.service';
import { prisma } from '../../src/utils/prisma';

const DOMAIN = '@cl.invalid';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const ahead = (ms: number) => new Date(Date.now() + ms);

let userId = '';

const cleanup = () => prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });

beforeAll(async () => {
  await cleanup();
  const user = await prisma.user.create({
    data: { fullName: 'Cleanup Tester', email: `cleanup${DOMAIN}`, passwordHash: 'not-a-real-hash', emailVerifiedAt: new Date() },
  });
  userId = user.id;
}, 120_000);

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('cleanupExpired', () => {
  test('removes expired sessions and long-dead tokens, and keeps everything still useful', async () => {
    await prisma.session.createMany({
      data: [
        { userId, tokenHash: 'cl-session-expired', expiresAt: ago(HOUR) },
        { userId, tokenHash: 'cl-session-valid', expiresAt: ahead(DAY) },
      ],
    });
    await prisma.emailVerificationToken.createMany({
      data: [
        { userId, tokenHash: 'cl-ev-old-expired', expiresAt: ago(8 * DAY) },
        { userId, tokenHash: 'cl-ev-old-used', expiresAt: ahead(DAY), usedAt: ago(8 * DAY) },
        { userId, tokenHash: 'cl-ev-recent-expired', expiresAt: ago(HOUR) },
        { userId, tokenHash: 'cl-ev-valid', expiresAt: ahead(DAY) },
      ],
    });
    await prisma.passwordResetToken.createMany({
      data: [
        { userId, tokenHash: 'cl-pr-old-expired', expiresAt: ago(8 * DAY) },
        { userId, tokenHash: 'cl-pr-old-used', expiresAt: ahead(HOUR), usedAt: ago(9 * DAY) },
        { userId, tokenHash: 'cl-pr-recent-used', expiresAt: ahead(HOUR), usedAt: ago(HOUR) },
        { userId, tokenHash: 'cl-pr-valid', expiresAt: ahead(HOUR) },
      ],
    });

    const result = await cleanupExpired();
    expect(result.sessions).toBeGreaterThanOrEqual(1);
    expect(result.emailVerificationTokens).toBeGreaterThanOrEqual(2);
    expect(result.passwordResetTokens).toBeGreaterThanOrEqual(2);

    const left = async (model: 'session' | 'emailVerificationToken' | 'passwordResetToken') =>
      ((await (prisma[model] as any).findMany({ where: { userId }, select: { tokenHash: true } })) as { tokenHash: string }[])
        .map((r) => r.tokenHash)
        .sort();

    expect(await left('session')).toEqual(['cl-session-valid']);
    expect(await left('emailVerificationToken')).toEqual(['cl-ev-recent-expired', 'cl-ev-valid']);
    expect(await left('passwordResetToken')).toEqual(['cl-pr-recent-used', 'cl-pr-valid']);
  });

  test('is safe to run again, and never touches the user', async () => {
    const again = await cleanupExpired();
    expect(again.emailVerificationTokens).toBe(0);
    expect(again.passwordResetTokens).toBe(0);
    expect(await prisma.user.count({ where: { id: userId } })).toBe(1);
  });
});
