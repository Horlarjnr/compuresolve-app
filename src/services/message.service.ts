import { createError } from '../common/errors/app-error';
import { getActorRole, STUDENT_MESSAGING_STATUSES } from '../policies/complaint-workflow';
import { canViewComplaint, canViewComplaintAsStaff } from '../policies/complaint.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import type { CreateMessageInput } from '../validators/message.validator';
import { recordAudit } from './audit.service';
import { notifyMessagePosted } from './notification.service';

const complaintSelect = {
  id: true,
  reference: true,
  scope: true,
  departmentId: true,
  submittedById: true,
  escalatedToFaculty: true,
  status: true,
  assignedToId: true,
};

const messageSelect = {
  id: true,
  body: true,
  visibility: true,
  createdAt: true,
  senderId: true,
  sender: { select: { id: true, fullName: true } },
};

type MessageRow = {
  id: string;
  body: string;
  visibility: string;
  createdAt: Date;
  senderId: string;
  sender: { id: string; fullName: string };
};

type ComplaintRow = {
  id: string;
  reference: string;
  scope: string;
  departmentId: string | null;
  submittedById: string;
  escalatedToFaculty: boolean;
  status: string;
  assignedToId: string | null;
};

// A complaint you may not see looks exactly like one that does not exist.
const loadVisible = async (user: AuthUser, complaintId: string): Promise<ComplaintRow> => {
  const complaint = await prisma.complaint.findUnique({ where: { id: complaintId }, select: complaintSelect });
  if (!complaint || !canViewComplaint(user, complaint)) throw createError(404, 'Complaint not found');
  return complaint;
};

// Two views. STAFF see everything, with sender names and the visibility flag.
// The STUDENT sees only student-visible messages, and staff senders appear only as "STAFF" (no names).
const presentMessage = (user: AuthUser, c: ComplaintRow, m: MessageRow) => {
  const senderRole = m.senderId === c.submittedById ? 'STUDENT' : 'STAFF';
  if (canViewComplaintAsStaff(user, c)) {
    return { id: m.id, body: m.body, visibility: m.visibility, createdAt: m.createdAt, senderRole, sender: m.sender };
  }
  return { id: m.id, body: m.body, createdAt: m.createdAt, senderRole, isYou: m.senderId === user.id };
};

export const listMessages = async (user: AuthUser, complaintId: string, page: number, limit: number) => {
  const c = await loadVisible(user, complaintId);
  // The student's query itself excludes internal messages, so they cannot even be counted.
  const where = {
    complaintId,
    ...(canViewComplaintAsStaff(user, c) ? {} : { visibility: 'STUDENT_AND_STAFF' as const }),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.complaintMessage.count({ where }),
    prisma.complaintMessage.findMany({
      where,
      select: messageSelect,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  return { items: rows.map((r) => presentMessage(user, c, r as MessageRow)), meta: { page, limit, total } };
};

// Sender, visibility rules and permissions are decided HERE. A message is never edited or deleted.
export const postMessage = async (user: AuthUser, complaintId: string, input: CreateMessageInput) => {
  const c = await loadVisible(user, complaintId);
  const isSubmitter = c.submittedById === user.id;
  const visibility = input.visibility ?? 'STUDENT_AND_STAFF';

  if (isSubmitter) {
    if (visibility !== 'STUDENT_AND_STAFF') {
      throw createError(403, 'Students cannot send internal messages', 'FORBIDDEN_VISIBILITY');
    }
    if (!(STUDENT_MESSAGING_STATUSES as string[]).includes(c.status)) {
      throw createError(409, 'This complaint is no longer open for messages. Use a reopen request instead.', 'MESSAGING_CLOSED');
    }
  } else {
    const role = getActorRole(user, c);
    if (!role) throw createError(403, 'You cannot post on this complaint', 'FORBIDDEN');
    if (role === 'OFFICER' && c.assignedToId !== user.id) {
      throw createError(403, 'Claim this complaint before posting', 'NOT_ASSIGNED');
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.complaintMessage.create({
      data: { complaintId, senderId: user.id, body: input.body, visibility },
      select: messageSelect,
    });
    await recordAudit(
      {
        actorId: user.id,
        departmentId: c.departmentId,
        action: 'complaint.message_posted',
        entityType: 'ComplaintMessage',
        entityId: row.id,
        metadata: { visibility }, // never the message text
      },
      tx,
    );
    await notifyMessagePosted(tx, c, { fromStudent: isSubmitter, visibility, actorId: user.id });
    return row;
  });
  return presentMessage(user, c, created as MessageRow);
};
