import { createError } from '../common/errors/app-error';
import type { AuthUser } from '../types/express';
import {
  type NotificationTypeName,
  statusLabel,
  statusNotificationTitle,
  statusNotificationType,
} from '../utils/notification-text';
import { prisma } from '../utils/prisma';
import type { ListNotificationsQuery } from '../validators/notification.validator';

// Works with the normal client or a transaction client, so a notification commits (or rolls back) together
// with the event that caused it.
type Db = Pick<typeof prisma, 'notification' | 'departmentMembership' | 'userFacultyRole'>;

export type ComplaintContext = {
  id: string;
  reference: string;
  scope: string;
  departmentId: string | null;
  submittedById: string;
  escalatedToFaculty?: boolean;
  assignedToId?: string | null;
};

// ---- who to tell ------------------------------------------------------------------------------------------

const departmentStaffIds = async (db: Db, departmentId: string, roles: ('OFFICER' | 'HOD')[]) => {
  const rows = await db.departmentMembership.findMany({
    where: { departmentId, role: { in: roles }, status: 'ACTIVE', user: { isActive: true } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
};

const facultyAdminIds = async (db: Db) => {
  const rows = await db.userFacultyRole.findMany({
    where: { role: 'FACULTY_ADMIN', isActive: true, user: { isActive: true } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
};

// Whoever may decide a reopen request: HOD + assigned Officer, or the Faculty Admins for faculty-level/escalated cases.
const deciderIds = async (db: Db, c: ComplaintContext) => {
  if (c.escalatedToFaculty || c.scope === 'FACULTY' || !c.departmentId) return facultyAdminIds(db);
  const hods = await departmentStaffIds(db, c.departmentId, ['HOD']);
  if (!c.assignedToId) return hods;
  const officers = await departmentStaffIds(db, c.departmentId, ['OFFICER']);
  return officers.includes(c.assignedToId) ? [...hods, c.assignedToId] : hods;
};

// ---- writing ----------------------------------------------------------------------------------------------

// Never notifies the person who caused the event, and never twice.
const notify = async (
  db: Db,
  recipients: string[],
  content: { type: NotificationTypeName; title: string; body: string; complaintId: string },
  excludeUserId?: string,
) => {
  const unique = Array.from(new Set(recipients)).filter((id) => id !== excludeUserId);
  if (unique.length === 0) return;
  await db.notification.createMany({ data: unique.map((userId) => ({ userId, ...content })) });
};

export const notifyComplaintSubmitted = async (db: Db, c: ComplaintContext) => {
  const staff =
    c.scope === 'DEPARTMENT' && c.departmentId
      ? await departmentStaffIds(db, c.departmentId, ['OFFICER', 'HOD'])
      : await facultyAdminIds(db);
  await notify(
    db,
    staff,
    { type: 'COMPLAINT_SUBMITTED', title: 'New complaint', body: `Complaint ${c.reference} was submitted.`, complaintId: c.id },
    c.submittedById,
  );
};

// Only when somebody ELSE assigned it (an Officer claiming their own complaint needs no notice).
export const notifyAssigned = (db: Db, c: ComplaintContext, officerId: string, actorId: string) =>
  notify(
    db,
    [officerId],
    {
      type: 'COMPLAINT_ASSIGNED',
      title: 'Complaint assigned to you',
      body: `Complaint ${c.reference} has been assigned to you.`,
      complaintId: c.id,
    },
    actorId,
  );

export const notifyStatusChanged = async (db: Db, c: ComplaintContext, toStatus: string, actorId: string) => {
  await notify(
    db,
    [c.submittedById],
    {
      type: statusNotificationType(toStatus),
      title: statusNotificationTitle(toStatus),
      body: `Complaint ${c.reference} is now ${statusLabel(toStatus)}.`,
      complaintId: c.id,
    },
    actorId,
  );
  if (toStatus === 'ESCALATED') {
    await notify(
      db,
      await facultyAdminIds(db),
      {
        type: 'COMPLAINT_ESCALATED',
        title: 'Complaint escalated to the faculty',
        body: `Complaint ${c.reference} was escalated and needs faculty attention.`,
        complaintId: c.id,
      },
      actorId,
    );
  }
};

// A message from the student goes to whoever is handling the complaint; a student-visible message from staff
// goes to the student. Internal (STAFF_ONLY) messages notify nobody. The text never contains the message itself.
export const notifyMessagePosted = async (
  db: Db,
  c: ComplaintContext,
  opts: { fromStudent: boolean; visibility: string; actorId: string },
) => {
  if (opts.visibility === 'STAFF_ONLY') return;
  const content = {
    type: 'MESSAGE_RECEIVED' as const,
    title: 'New message',
    body: `New message on complaint ${c.reference}.`,
    complaintId: c.id,
  };
  if (!opts.fromStudent) return notify(db, [c.submittedById], content, opts.actorId);

  if (c.escalatedToFaculty || c.scope === 'FACULTY' || !c.departmentId) {
    return notify(db, await facultyAdminIds(db), content, opts.actorId);
  }
  const hods = await departmentStaffIds(db, c.departmentId, ['HOD']);
  const officers = await departmentStaffIds(db, c.departmentId, ['OFFICER']);
  // The assigned Officer if there is an active one, otherwise every active Officer of the department.
  const handlers = c.assignedToId && officers.includes(c.assignedToId) ? [c.assignedToId] : officers;
  return notify(db, [...hods, ...handlers], content, opts.actorId);
};

export const notifyReopenRequested = async (db: Db, c: ComplaintContext) =>
  notify(db, await deciderIds(db, c), {
    type: 'REOPEN_REQUESTED',
    title: 'Reopen requested',
    body: `A reopen was requested for complaint ${c.reference}.`,
    complaintId: c.id,
  });

export const notifyReopenDecided = (db: Db, c: ComplaintContext, approved: boolean, actorId: string) =>
  notify(
    db,
    [c.submittedById],
    {
      type: 'REOPEN_REQUEST_DECIDED',
      title: 'Reopen request decided',
      body: `Your reopen request for complaint ${c.reference} was ${approved ? 'approved' : 'rejected'}.`,
      complaintId: c.id,
    },
    actorId,
  );

// ---- reading (always only the signed-in user's own) ---------------------------------------------------------

const notificationSelect = { id: true, type: true, title: true, body: true, complaintId: true, readAt: true, createdAt: true };

export const listNotifications = async (user: AuthUser, query: ListNotificationsQuery) => {
  const where = { userId: user.id, ...(query.unread ? { readAt: null } : {}) };
  const [total, unread, items] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      select: notificationSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return { items, meta: { page: query.page, limit: query.limit, total, unread } };
};

// Someone else's notification looks exactly like one that does not exist.
export const markNotificationRead = async (user: AuthUser, notificationId: string) => {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId: user.id },
    select: notificationSelect,
  });
  if (!existing) throw createError(404, 'Notification not found');
  if (existing.readAt) return existing; // already read: nothing to change
  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    select: notificationSelect,
  });
};
