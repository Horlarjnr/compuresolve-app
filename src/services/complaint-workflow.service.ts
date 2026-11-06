import { createError } from '../common/errors/app-error';
import {
  type ComplaintStatusName,
  getActorRole,
  isTransitionDefined,
  OPEN_STATUSES,
  targetsFor,
} from '../policies/complaint-workflow';
import { canViewComplaint } from '../policies/complaint.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import type { TransitionInput } from '../validators/complaint.validator';
import { recordAudit } from './audit.service';
import { getComplaint } from './complaint.service';

const workflowSelect = {
  id: true,
  scope: true,
  departmentId: true,
  submittedById: true,
  escalatedToFaculty: true,
  status: true,
  assignedToId: true,
};

// Out-of-scope complaints look exactly like missing ones.
const loadForActor = async (actor: AuthUser, complaintId: string) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId }, select: workflowSelect });
  if (!complaint || !canViewComplaint(actor, complaint)) throw createError(404, 'Complaint not found');
  return complaint;
};

const assertAssignable = (c: { scope: string; escalatedToFaculty: boolean; status: string }) => {
  if (c.scope !== 'DEPARTMENT' || c.escalatedToFaculty) {
    throw createError(409, 'Faculty-level and escalated complaints are not assigned to Officers', 'NOT_ASSIGNABLE');
  }
  if (!OPEN_STATUSES.includes(c.status as ComplaintStatusName)) {
    throw createError(409, 'This complaint is no longer open for assignment', 'NOT_ASSIGNABLE');
  }
};

// HOD: assign or reassign to any active Officer of the department.
// Officer: may only claim an UNASSIGNED complaint for themselves.
export const assignComplaint = async (actor: AuthUser, complaintId: string, officerId: string) => {
  const c = await loadForActor(actor, complaintId);
  const role = getActorRole(actor, c);
  assertAssignable(c);
  if (role !== 'HOD' && role !== 'OFFICER') throw createError(403, 'You cannot assign this complaint', 'FORBIDDEN');

  if (role === 'OFFICER') {
    if (officerId !== actor.id) throw createError(403, 'Officers can only assign a complaint to themselves', 'FORBIDDEN');
    if (c.assignedToId) throw createError(409, 'This complaint is already assigned', 'ALREADY_ASSIGNED');
  }
  if (c.assignedToId === officerId) throw createError(409, 'This Officer is already assigned', 'NO_CHANGE');

  // The assignee must be an ACTIVE Officer of THIS complaint's department.
  const assignee = await prisma.departmentMembership.findFirst({
    where: {
      userId: officerId,
      departmentId: c.departmentId!,
      role: 'OFFICER',
      status: 'ACTIVE',
      user: { isActive: true },
    },
    select: { id: true },
  });
  if (!assignee) throw createError(400, 'That person is not an active Officer of this department', 'INVALID_ASSIGNEE');

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // The conditions in `where` make this a compare-and-set: if anything changed meanwhile, nothing is written.
    const updated = await tx.complaint.updateMany({
      where: { id: c.id, escalatedToFaculty: false, status: { in: OPEN_STATUSES }, assignedToId: c.assignedToId },
      data: { assignedToId: officerId },
    });
    if (updated.count !== 1) throw createError(409, 'The complaint changed. Please reload and try again.', 'STATE_CHANGED');

    await tx.complaintAssignment.updateMany({ where: { complaintId: c.id, unassignedAt: null }, data: { unassignedAt: now } });
    await tx.complaintAssignment.create({ data: { complaintId: c.id, officerId, assignedById: actor.id } });
    await recordAudit(
      {
        actorId: actor.id,
        departmentId: c.departmentId,
        action: 'complaint.assigned',
        entityType: 'Complaint',
        entityId: c.id,
        metadata: { by: role },
      },
      tx,
    );
  });
  return getComplaint(actor, complaintId);
};

// HOD only.
export const unassignComplaint = async (actor: AuthUser, complaintId: string) => {
  const c = await loadForActor(actor, complaintId);
  if (getActorRole(actor, c) !== 'HOD') throw createError(403, 'Only the Head of Department can remove an assignment', 'FORBIDDEN');
  assertAssignable(c);
  if (!c.assignedToId) throw createError(409, 'This complaint is not assigned', 'NO_CHANGE');

  await prisma.$transaction(async (tx) => {
    const updated = await tx.complaint.updateMany({
      where: { id: c.id, escalatedToFaculty: false, status: { in: OPEN_STATUSES }, assignedToId: c.assignedToId },
      data: { assignedToId: null },
    });
    if (updated.count !== 1) throw createError(409, 'The complaint changed. Please reload and try again.', 'STATE_CHANGED');

    await tx.complaintAssignment.updateMany({ where: { complaintId: c.id, unassignedAt: null }, data: { unassignedAt: new Date() } });
    await recordAudit(
      {
        actorId: actor.id,
        departmentId: c.departmentId,
        action: 'complaint.unassigned',
        entityType: 'Complaint',
        entityId: c.id,
      },
      tx,
    );
  });
  return getComplaint(actor, complaintId);
};

// Every status change, assignment clearing, escalation record and audit entry commit together or not at all.
export const transitionComplaint = async (actor: AuthUser, complaintId: string, input: TransitionInput) => {
  const c = await loadForActor(actor, complaintId);
  const to = input.toStatus as ComplaintStatusName;

  const role = getActorRole(actor, c);
  if (!role) throw createError(403, 'You cannot change this complaint', 'FORBIDDEN');
  if (role === 'OFFICER' && c.assignedToId !== actor.id) {
    throw createError(403, 'Claim this complaint before changing its status', 'NOT_ASSIGNED');
  }
  if (!isTransitionDefined(c, to)) {
    throw createError(409, `A complaint that is ${c.status} cannot become ${to}`, 'INVALID_TRANSITION');
  }
  if (!targetsFor(c, role).includes(to)) {
    throw createError(403, 'You are not allowed to make this change', 'FORBIDDEN_TRANSITION');
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    const data = {
      status: to,
      ...(to === 'RESOLVED' ? { resolutionNote: input.reason, resolvedAt: now, closedAt: null } : {}),
      ...(to === 'CLOSED' ? { closedAt: now } : {}),
      ...(to === 'ESCALATED' ? { escalatedToFaculty: true, escalatedAt: now, assignedToId: null } : {}),
    };

    // Compare-and-set on what we loaded: two people acting at once cannot both succeed.
    const updated = await tx.complaint.updateMany({
      where: {
        id: c.id,
        status: c.status,
        escalatedToFaculty: c.escalatedToFaculty,
        assignedToId: c.assignedToId,
      },
      data,
    });
    if (updated.count !== 1) throw createError(409, 'The complaint changed. Please reload and try again.', 'STATE_CHANGED');

    await tx.complaintStatusHistory.create({
      data: { complaintId: c.id, actorId: actor.id, fromStatus: c.status, toStatus: to, reason: input.reason ?? null },
    });

    if (to === 'ESCALATED') {
      await tx.complaintAssignment.updateMany({ where: { complaintId: c.id, unassignedAt: null }, data: { unassignedAt: now } });
      await tx.complaintEscalation.create({
        data: {
          complaintId: c.id,
          escalatedById: actor.id,
          fromDepartmentId: c.departmentId,
          reason: input.reason!,
        },
      });
    }

    await recordAudit(
      {
        actorId: actor.id,
        departmentId: c.departmentId,
        action: `complaint.status.${to.toLowerCase()}`,
        entityType: 'Complaint',
        entityId: c.id,
        metadata: { from: c.status, to },
      },
      tx,
    );
  });
  return getComplaint(actor, complaintId);
};
