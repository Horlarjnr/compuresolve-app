import { createError } from '../common/errors/app-error';
import { type ComplaintStatusName, canDecideReopen, REOPENABLE_STATUSES } from '../policies/complaint-workflow';
import { canViewComplaint, canViewComplaintAsStaff, complaintScopeWhere } from '../policies/complaint.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import type { ListReopenQuery, ReopenDecisionInput } from '../validators/reopen.validator';
import { recordAudit } from './audit.service';
import { getComplaint } from './complaint.service';
import { notifyReopenDecided, notifyReopenRequested } from './notification.service';

const isReopenable = (status: string) => (REOPENABLE_STATUSES as string[]).includes(status);

// A student ASKS. This only records the request: the complaint itself is not touched.
export const createReopenRequest = async (user: AuthUser, complaintId: string, reason: string) => {
  const complaint = await prisma.complaint.findUnique({
    where: { id: complaintId },
    select: {
      id: true,
      reference: true,
      scope: true,
      submittedById: true,
      status: true,
      departmentId: true,
      escalatedToFaculty: true,
      assignedToId: true,
    },
  });
  // Only the student who submitted it. Everyone else sees "not found".
  if (!complaint || complaint.submittedById !== user.id) throw createError(404, 'Complaint not found');
  if (!isReopenable(complaint.status)) {
    throw createError(409, 'Only a resolved, closed or rejected complaint can be reopened', 'NOT_REOPENABLE');
  }

  await prisma.$transaction(async (tx) => {
    // Lock this complaint row so two simultaneous requests cannot both create a pending request.
    await tx.$queryRaw`SELECT id FROM "Complaint" WHERE id = ${complaintId}::uuid FOR UPDATE`;

    const current = await tx.complaint.findUnique({ where: { id: complaintId }, select: { status: true } });
    if (!current || !isReopenable(current.status)) {
      throw createError(409, 'Only a resolved, closed or rejected complaint can be reopened', 'NOT_REOPENABLE');
    }
    const pending = await tx.complaintReopenRequest.findFirst({
      where: { complaintId, status: 'PENDING' },
      select: { id: true },
    });
    if (pending) throw createError(409, 'You already have a pending reopen request for this complaint', 'REOPEN_PENDING');

    const request = await tx.complaintReopenRequest.create({
      data: { complaintId, requesterId: user.id, reason },
      select: { id: true },
    });
    await recordAudit(
      {
        actorId: user.id,
        departmentId: complaint.departmentId,
        action: 'complaint.reopen_requested',
        entityType: 'ComplaintReopenRequest',
        entityId: request.id,
        metadata: { complaintId },
      },
      tx,
    );
    await notifyReopenRequested(tx, complaint);
  });
  return getComplaint(user, complaintId);
};

const queueSelect = {
  id: true,
  status: true,
  reason: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
  requester: { select: { id: true, fullName: true, matricNumber: true } },
  decidedBy: { select: { id: true, fullName: true } },
  complaint: {
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      scope: true,
      departmentId: true,
      submittedById: true,
      escalatedToFaculty: true,
      assignedToId: true,
      department: { select: { id: true, name: true, code: true } },
    },
  },
};

type QueueRow = {
  id: string;
  status: string;
  reason: string;
  decisionNote: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  requester: { id: string; fullName: string; matricNumber: string | null };
  decidedBy: { id: string; fullName: string } | null;
  complaint: {
    id: string;
    reference: string;
    title: string;
    status: string;
    scope: string;
    departmentId: string | null;
    submittedById: string;
    escalatedToFaculty: boolean;
    assignedToId: string | null;
    department: { id: string; name: string; code: string } | null;
  };
};

const presentQueueRow = (user: AuthUser, r: QueueRow) => {
  const staff = canViewComplaintAsStaff(user, r.complaint);
  return {
    id: r.id,
    status: r.status,
    reason: r.reason,
    decisionNote: r.decisionNote,
    decidedAt: r.decidedAt,
    createdAt: r.createdAt,
    complaint: {
      id: r.complaint.id,
      reference: r.complaint.reference,
      title: r.complaint.title,
      status: r.complaint.status,
      scope: r.complaint.scope,
      department: r.complaint.department,
    },
    ...(staff
      ? { requester: r.requester, decidedBy: r.decidedBy, canDecide: r.status === 'PENDING' && canDecideReopen(user, r.complaint) }
      : {}),
  };
};

// The access rule on the COMPLAINT is the first condition: you only see requests on complaints you may see.
export const listReopenRequests = async (user: AuthUser, query: ListReopenQuery) => {
  const filters: object[] = [{ complaint: complaintScopeWhere(user) }];
  if (query.status) filters.push({ status: query.status });
  const where = { AND: filters };

  const [total, rows] = await prisma.$transaction([
    prisma.complaintReopenRequest.count({ where }),
    prisma.complaintReopenRequest.findMany({
      where,
      select: queueSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { items: rows.map((r) => presentQueueRow(user, r as QueueRow)), meta: { page: query.page, limit: query.limit, total } };
};

// Approve: the complaint returns to UNDER_REVIEW (history row written). Reject: the complaint is untouched.
// Everything commits together or not at all.
export const decideReopenRequest = async (actor: AuthUser, requestId: string, input: ReopenDecisionInput) => {
  const request = await prisma.complaintReopenRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      complaintId: true,
      complaint: {
        select: {
          id: true,
          reference: true,
          scope: true,
          departmentId: true,
          submittedById: true,
          escalatedToFaculty: true,
          status: true,
          assignedToId: true,
        },
      },
    },
  });
  const c = request?.complaint;
  if (!request || !c || !canViewComplaint(actor, c)) throw createError(404, 'Reopen request not found');

  if (!canDecideReopen(actor, c)) {
    const message =
      c.assignedToId !== actor.id && !c.escalatedToFaculty && c.scope === 'DEPARTMENT'
        ? 'Only the assigned Officer or the Head of Department can decide this request'
        : 'You cannot decide this request';
    throw createError(403, message, 'FORBIDDEN');
  }
  if (request.status !== 'PENDING') throw createError(409, 'This request has already been decided', 'REQUEST_DECIDED');
  const approve = input.decision === 'APPROVE';
  if (approve && !isReopenable(c.status)) {
    throw createError(409, 'The complaint is no longer in a state that can be reopened', 'NOT_REOPENABLE');
  }

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Claim the request first so it can only be decided once.
    const claimed = await tx.complaintReopenRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: {
        status: approve ? 'APPROVED' : 'REJECTED',
        decidedById: actor.id,
        decisionNote: input.note ?? null,
        decidedAt: now,
      },
    });
    if (claimed.count !== 1) throw createError(409, 'This request has already been decided', 'REQUEST_DECIDED');

    if (approve) {
      const updated = await tx.complaint.updateMany({
        where: { id: c.id, status: c.status, escalatedToFaculty: c.escalatedToFaculty },
        data: { status: 'UNDER_REVIEW', resolvedAt: null, closedAt: null, resolutionNote: null },
      });
      if (updated.count !== 1) {
        throw createError(409, 'The complaint changed. Please reload and try again.', 'STATE_CHANGED');
      }
      await tx.complaintStatusHistory.create({
        data: {
          complaintId: c.id,
          actorId: actor.id,
          fromStatus: c.status as ComplaintStatusName,
          toStatus: 'UNDER_REVIEW',
          reason: input.note ?? 'Reopen request approved',
        },
      });
    }

    await recordAudit(
      {
        actorId: actor.id,
        departmentId: c.departmentId,
        action: approve ? 'complaint.reopen_approved' : 'complaint.reopen_rejected',
        entityType: 'ComplaintReopenRequest',
        entityId: request.id,
        metadata: { complaintId: c.id },
      },
      tx,
    );
    await notifyReopenDecided(tx, c, approve, actor.id);
  });
  return getComplaint(actor, c.id);
};
