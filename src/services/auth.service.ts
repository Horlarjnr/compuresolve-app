import { createError } from '../common/errors/app-error';
import type { RegisterInput } from '../validators/auth.validator';
import type { AuthUser } from '../types/express';
import { logger } from '../utils/logger';
import { hashPassword, verifyPassword } from '../utils/password';
import { prisma } from '../utils/prisma';
import { getUserRoles } from '../utils/roles';
import { EMAIL_VERIFY_TTL_MS, generateToken, hashToken, SESSION_TTL_MS } from '../utils/token';
import { publicUserSelect } from '../utils/user-select';
import { sendVerificationEmail } from './mail.service';

const RESEND_COOLDOWN_MS = 60 * 1000;

// What the client receives about a signed-in user: public fields + a simple list of role names.
export const presentUser = (user: AuthUser) => ({ ...user, roles: Array.from(getUserRoles(user)) });

// The account already exists at this point, so a mail failure must not fail the request.
// The student can use "resend verification". We log the user id only, never the link or token.
const sendVerificationSafely = async (userId: string, email: string, fullName: string, token: string) => {
  try {
    await sendVerificationEmail(email, fullName, token);
  } catch (error) {
    logger.error(`Could not send verification email for user ${userId}: ${(error as Error).message}`);
  }
};

// Role and department membership are decided HERE. The client only picks which department to join as a student.
export const registerStudent = async (input: RegisterInput) => {
  const department = await prisma.department.findFirst({
    where: { id: input.departmentId, isActive: true },
    select: { id: true },
  });
  if (!department) throw createError(400, 'Selected department is not available', 'INVALID_DEPARTMENT');

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { matricNumber: input.matricNumber }] },
    select: { email: true },
  });
  if (existing) {
    const message =
      existing.email === input.email
        ? 'An account with this email already exists'
        : 'This matric number is already registered';
    throw createError(409, message, 'CONFLICT');
  }

  const rawToken = generateToken();
  // One nested create = one transaction: user, student profile, STUDENT membership and verification token together.
  const user = await prisma.user.create({
    data: {
      fullName: input.fullName,
      email: input.email,
      passwordHash: await hashPassword(input.password),
      matricNumber: input.matricNumber,
      studentProfile: { create: { level: input.level } },
      memberships: { create: { departmentId: department.id, role: 'STUDENT', status: 'ACTIVE' } },
      emailVerificationTokens: {
        create: { tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS) },
      },
    },
    select: { id: true, fullName: true, email: true },
  });

  await sendVerificationSafely(user.id, user.email, user.fullName, rawToken);
  return user;
};

export const verifyEmail = async (token: string) => {
  const now = new Date();
  const record = await prisma.emailVerificationToken.findFirst({
    where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: now } },
    select: { id: true, userId: true },
  });
  if (!record) throw createError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');

  await prisma.$transaction(async (tx) => {
    // Claim the token first so it can only ever be used once, even with two simultaneous requests.
    const claimed = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw createError(400, 'Invalid or expired verification link', 'INVALID_TOKEN');
    await tx.user.updateMany({ where: { id: record.userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
  });
};

// Always returns nothing, and the controller always sends the same reply, so this cannot be used
// to discover which emails are registered.
export const resendVerification = async (email: string) => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, isActive: true, emailVerifiedAt: true },
  });
  if (!user || !user.isActive || user.emailVerifiedAt) return;

  const latest = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  const rawToken = generateToken();
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } }), // old links stop working
    prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
      },
    }),
  ]);
  await sendVerificationSafely(user.id, user.email, user.fullName, rawToken);
};

export const login = async (email: string, password: string) => {
  const found = await prisma.user.findUnique({
    where: { email },
    select: { ...publicUserSelect, passwordHash: true },
  });

  // Always run a full password check (even for unknown emails) and give one message for both failures.
  const passwordOk = await verifyPassword(password, found?.passwordHash);
  if (!found || !passwordOk) throw createError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

  if (!found.isActive) throw createError(403, 'This account is disabled', 'ACCOUNT_DISABLED');
  if (!found.emailVerifiedAt) {
    throw createError(403, 'Please verify your email before logging in', 'EMAIL_NOT_VERIFIED');
  }

  const { passwordHash: _passwordHash, ...user } = found;

  // A brand-new random token on every login. Only its hash is stored.
  const token = generateToken();
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }), // tidy old sessions
    prisma.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    }),
  ]);

  return { token, user: presentUser(user) };
};

export const logout = async (token: string) => {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
};
