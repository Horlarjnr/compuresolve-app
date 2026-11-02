import { createError } from '../common/errors/app-error';
import type { AuthUser } from '../types/express';
import { logger } from '../utils/logger';
import { hashPassword, passwordSchema, verifyPassword } from '../utils/password';
import { prisma } from '../utils/prisma';
import { departmentIdsForRole, isFacultyAdmin } from '../utils/roles';
import { generateToken, hashToken, INVITATION_TTL_MS } from '../utils/token';
import type { AcceptInvitationInput, CreateInvitationInput } from '../validators/invitation.validator';
import { recordAudit } from './audit.service';
import { sendStaffInvitationEmail } from './mail.service';

type Target = {
  requestedRole: 'OFFICER' | 'HOD' | null;
  requestedFacultyRole: 'FACULTY_ADMIN' | null;
  departmentId: string | null;
};

const ROLE_LABELS = { OFFICER: 'Department Officer', HOD: 'Head of Department', FACULTY_ADMIN: 'Faculty Administrator' };

const targetRoleName = (t: Target) => t.requestedRole ?? t.requestedFacultyRole!;

const buildTarget = (input: CreateInvitationInput): Target =>
  input.role === 'FACULTY_ADMIN'
    ? { requestedRole: null, requestedFacultyRole: 'FACULTY_ADMIN', departmentId: null }
    : { requestedRole: input.role, requestedFacultyRole: null, departmentId: input.departmentId! };

// WHO MAY INVITE WHOM (decided here, never by the client):
// - Faculty Admin: Officers and HODs in any department, and other Faculty Admins.
// - HOD: Officers in their OWN department(s) only.
const assertMayInvite = (actor: AuthUser, target: Target) => {
  if (isFacultyAdmin(actor)) return;
  const hodDepartments = departmentIdsForRole(actor, 'HOD');
  if (target.requestedRole === 'OFFICER' && target.departmentId && hodDepartments.includes(target.departmentId)) return;
  throw createError(403, 'You are not allowed to send this invitation');
};

// Same scope for seeing and revoking an existing invitation.
const mayManage = (actor: AuthUser, invitation: { requestedRole: string | null; departmentId: string | null }) => {
  if (isFacultyAdmin(actor)) return true;
  return (
    invitation.requestedRole === 'OFFICER' &&
    !!invitation.departmentId &&
    departmentIdsForRole(actor, 'HOD').includes(invitation.departmentId)
  );
};

type ExistingUser = {
  memberships: { departmentId: string; role: string }[];
  facultyRoles: { role: string }[];
};

// Staff and student accounts stay separate, and nobody is invited to a role they already hold.
const assertEligible = (existing: ExistingUser, target: Target) => {
  if (existing.memberships.some((m) => m.role === 'STUDENT')) {
    throw createError(409, 'This email belongs to a student account. Use a different email.', 'STUDENT_ACCOUNT');
  }
  if (target.requestedFacultyRole && existing.facultyRoles.some((f) => f.role === target.requestedFacultyRole)) {
    throw createError(409, 'This user already has that role', 'ALREADY_HAS_ROLE');
  }
  if (target.departmentId && existing.memberships.some((m) => m.departmentId === target.departmentId)) {
    throw createError(409, 'This user already has a role in that department', 'ALREADY_HAS_ROLE');
  }
};

const invitationSelect = {
  id: true,
  email: true,
  requestedRole: true,
  requestedFacultyRole: true,
  departmentId: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
  department: { select: { id: true, name: true } },
  invitedBy: { select: { id: true, fullName: true } },
};

type InvitationRow = {
  id: string;
  email: string;
  requestedRole: string | null;
  requestedFacultyRole: string | null;
  departmentId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  department: { id: string; name: string } | null;
  invitedBy: { id: string; fullName: string };
};

const statusOf = (i: InvitationRow) => {
  if (i.acceptedAt) return 'ACCEPTED';
  if (i.revokedAt) return 'REVOKED';
  if (i.expiresAt.getTime() <= Date.now()) return 'EXPIRED';
  return 'PENDING';
};

// Never includes the token or its hash.
const present = (i: InvitationRow) => ({
  id: i.id,
  email: i.email,
  role: i.requestedRole ?? i.requestedFacultyRole,
  department: i.department,
  status: statusOf(i),
  expiresAt: i.expiresAt,
  createdAt: i.createdAt,
  invitedBy: i.invitedBy,
});

export const createInvitation = async (actor: AuthUser, input: CreateInvitationInput) => {
  const target = buildTarget(input);
  assertMayInvite(actor, target); // authorization first

  let departmentName: string | null = null;
  if (target.departmentId) {
    const department = await prisma.department.findFirst({
      where: { id: target.departmentId, isActive: true },
      select: { name: true },
    });
    if (!department) throw createError(400, 'Selected department is not available', 'INVALID_DEPARTMENT');
    departmentName = department.name;
  }

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { memberships: { select: { departmentId: true, role: true } }, facultyRoles: { select: { role: true } } },
  });
  if (existing) assertEligible(existing, target);

  // One Head of Department per department: refuse if one is active or an invitation is already pending.
  if (target.requestedRole === 'HOD' && target.departmentId) {
    const activeHod = await prisma.departmentMembership.findFirst({
      where: { departmentId: target.departmentId, role: 'HOD', status: 'ACTIVE' },
      select: { id: true },
    });
    if (activeHod) throw createError(409, 'This department already has a Head of Department', 'HOD_EXISTS');

    const pendingHod = await prisma.staffInvitation.findFirst({
      where: {
        departmentId: target.departmentId,
        requestedRole: 'HOD',
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pendingHod) {
      throw createError(409, 'A Head of Department invitation is already pending for this department', 'DUPLICATE_INVITATION');
    }
  }

  const duplicate = await prisma.staffInvitation.findFirst({
    where: {
      email: input.email,
      requestedRole: target.requestedRole,
      requestedFacultyRole: target.requestedFacultyRole,
      departmentId: target.departmentId,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (duplicate) throw createError(409, 'A pending invitation for this role already exists', 'DUPLICATE_INVITATION');

  const token = generateToken();
  const invitation = await prisma.staffInvitation.create({
    data: {
      email: input.email,
      ...target,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      invitedById: actor.id,
    },
    select: invitationSelect,
  });

  const roleName = targetRoleName(target);
  const label = departmentName ? `${ROLE_LABELS[roleName]} (${departmentName})` : ROLE_LABELS[roleName];
  try {
    await sendStaffInvitationEmail(input.email, label, token);
  } catch (error) {
    // No email means nobody can use the invitation, so remove it instead of leaving a dead link behind.
    await prisma.staffInvitation.delete({ where: { id: invitation.id } });
    logger.error(`Could not send staff invitation email: ${(error as Error).message}`);
    throw createError(502, 'Could not send the invitation email. Please try again.', 'MAIL_FAILED');
  }

  await recordAudit({
    actorId: actor.id,
    departmentId: target.departmentId,
    action: 'invitation.created',
    entityType: 'StaffInvitation',
    entityId: invitation.id,
    metadata: { role: roleName },
  });
  return present(invitation);
};

export const listInvitations = async (actor: AuthUser) => {
  const where = isFacultyAdmin(actor)
    ? {}
    : { requestedRole: 'OFFICER' as const, departmentId: { in: departmentIdsForRole(actor, 'HOD') } };
  const rows = await prisma.staffInvitation.findMany({
    where,
    select: invitationSelect,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(present);
};

export const revokeInvitation = async (actor: AuthUser, id: string) => {
  const invitation = await prisma.staffInvitation.findUnique({
    where: { id },
    select: { id: true, requestedRole: true, requestedFacultyRole: true, departmentId: true, acceptedAt: true, revokedAt: true },
  });
  // Out-of-scope invitations look exactly like missing ones.
  if (!invitation || !mayManage(actor, invitation)) throw createError(404, 'Invitation not found');
  if (invitation.acceptedAt || invitation.revokedAt) {
    throw createError(409, 'This invitation is no longer pending', 'INVITATION_CLOSED');
  }

  const revoked = await prisma.staffInvitation.updateMany({
    where: { id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) throw createError(409, 'This invitation is no longer pending', 'INVITATION_CLOSED');

  await recordAudit({
    actorId: actor.id,
    departmentId: invitation.departmentId,
    action: 'invitation.revoked',
    entityType: 'StaffInvitation',
    entityId: id,
    metadata: { role: invitation.requestedRole ?? invitation.requestedFacultyRole },
  });
};

// Public endpoint: whoever holds the emailed link can accept. The role comes from the stored invitation only.
export const acceptInvitation = async (input: AcceptInvitationInput) => {
  const now = new Date();
  const invitation = await prisma.staffInvitation.findFirst({
    where: { tokenHash: hashToken(input.token), acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    select: {
      id: true,
      email: true,
      requestedRole: true,
      requestedFacultyRole: true,
      departmentId: true,
      invitedById: true,
      department: { select: { isActive: true } },
    },
  });
  if (!invitation) throw createError(400, 'Invalid or expired invitation', 'INVALID_TOKEN');
  if (invitation.departmentId && !invitation.department?.isActive) {
    throw createError(400, 'The department for this invitation is no longer available', 'INVALID_DEPARTMENT');
  }

  const target: Target = {
    requestedRole: invitation.requestedRole as Target['requestedRole'],
    requestedFacultyRole: invitation.requestedFacultyRole as Target['requestedFacultyRole'],
    departmentId: invitation.departmentId,
  };

  const existing = await prisma.user.findUnique({
    where: { email: invitation.email },
    select: {
      id: true,
      isActive: true,
      passwordHash: true,
      memberships: { select: { departmentId: true, role: true } },
      facultyRoles: { select: { role: true } },
    },
  });

  let newPasswordHash: string | undefined;
  if (existing) {
    // Existing account: prove it is theirs with the current password.
    if (!(await verifyPassword(input.password, existing.passwordHash))) {
      throw createError(401, 'Incorrect password for the existing account', 'INVALID_CREDENTIALS');
    }
    if (!existing.isActive) throw createError(403, 'This account is disabled', 'ACCOUNT_DISABLED');
    assertEligible(existing, target);
  } else {
    if (!input.fullName) {
      throw createError(400, 'Validation failed', 'VALIDATION_ERROR', [
        { field: 'fullName', message: 'Full name is required' },
      ]);
    }
    const strength = passwordSchema.safeParse(input.password);
    if (!strength.success) {
      throw createError(
        400,
        'Validation failed',
        'VALIDATION_ERROR',
        strength.error.issues.map((i) => ({ field: 'password', message: i.message })),
      );
    }
    newPasswordHash = await hashPassword(input.password);
  }

  await prisma.$transaction(async (tx) => {
    // Claim the invitation first so it can only ever be used once.
    const claimed = await tx.staffInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { acceptedAt: now },
    });
    if (claimed.count !== 1) throw createError(400, 'Invalid or expired invitation', 'INVALID_TOKEN');

    let userId: string;
    if (existing) {
      userId = existing.id;
      // Opening the emailed link proves they control this address.
      await tx.user.updateMany({ where: { id: userId, emailVerifiedAt: null }, data: { emailVerifiedAt: now } });
    } else {
      const created = await tx.user.create({
        data: {
          fullName: input.fullName!,
          email: invitation.email,
          passwordHash: newPasswordHash!,
          emailVerifiedAt: now,
        },
        select: { id: true },
      });
      userId = created.id;
    }

    if (target.requestedRole === 'HOD') {
      // Checked inside the transaction (a unique database index also guards against a simultaneous accept).
      const activeHod = await tx.departmentMembership.findFirst({
        where: { departmentId: target.departmentId!, role: 'HOD', status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeHod) throw createError(409, 'This department already has a Head of Department', 'HOD_EXISTS');
    }
    if (target.requestedRole) {
      await tx.departmentMembership.create({
        data: { userId, departmentId: target.departmentId!, role: target.requestedRole, status: 'ACTIVE' },
      });
    }
    if (target.requestedFacultyRole) {
      await tx.userFacultyRole.create({ data: { userId, role: target.requestedFacultyRole, isActive: true } });
    }

    // Approval trail in the model made for it.
    await tx.roleGrantRequest.create({
      data: {
        userId,
        requestedRole: target.requestedRole,
        requestedFacultyRole: target.requestedFacultyRole,
        departmentId: target.departmentId,
        status: 'ACTIVE',
        reason: 'Granted by staff invitation',
        reviewedById: invitation.invitedById,
        reviewedAt: now,
      },
    });

    await recordAudit(
      {
        actorId: userId,
        departmentId: target.departmentId,
        action: 'invitation.accepted',
        entityType: 'StaffInvitation',
        entityId: invitation.id,
        metadata: { role: targetRoleName(target) },
      },
      tx,
    );
  });
};
