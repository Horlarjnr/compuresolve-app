import { type ComplaintStatusName, OPEN_STATUSES, REOPENABLE_STATUSES } from '../policies/complaint-workflow';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { departmentIdsForRole, getUserRoles, isFacultyAdmin } from '../utils/roles';
import { recentComplaints } from './complaint.service';

// Counts are computed by the database (groupBy / count): complaints are never loaded just to be counted.
// Every number is built on the same access rules as the complaint list, so a role only ever sees its own scope.

const ALL_STATUSES: ComplaintStatusName[] = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'AWAITING_STUDENT',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'REJECTED',
];

const emptyCounts = () => Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ComplaintStatusName, number>;

type StatusRow = { status: string; _count: { _all: number } };

const toCounts = (rows: StatusRow[]) => {
  const byStatus = emptyCounts();
  for (const r of rows) byStatus[r.status as ComplaintStatusName] = r._count._all;
  return byStatus;
};
const sum = (counts: Record<string, number>, statuses: string[]) => statuses.reduce((n, s) => n + (counts[s] ?? 0), 0);
const total = (counts: Record<string, number>) => Object.values(counts).reduce((n, v) => n + v, 0);

const departmentInfo = (ids: string[]) =>
  prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } });

// ---- student -----------------------------------------------------------------------------------------------

const studentSection = async (user: AuthUser) => {
  const mine = { submittedById: user.id };
  const [rows, canRequestReopen, pendingReopenRequests, recent] = await Promise.all([
    prisma.complaint.groupBy({ by: ['status'], where: mine, _count: { _all: true } }),
    prisma.complaint.count({
      where: { ...mine, status: { in: REOPENABLE_STATUSES }, reopenRequests: { none: { status: 'PENDING' } } },
    }),
    prisma.complaintReopenRequest.count({ where: { requesterId: user.id, status: 'PENDING' } }),
    recentComplaints(user, mine, 5),
  ]);
  const byStatus = toCounts(rows);
  return {
    total: total(byStatus),
    byStatus,
    awaitingMyReply: byStatus.AWAITING_STUDENT,
    canRequestReopen,
    pendingReopenRequests,
    recent,
  };
};

// ---- officer -----------------------------------------------------------------------------------------------

const officerSection = async (user: AuthUser) => {
  const departmentIds = departmentIdsForRole(user, 'OFFICER');
  // work that still belongs to the department (escalated cases have moved to the faculty)
  const ownedOpen = { departmentId: { in: departmentIds }, scope: 'DEPARTMENT' as const, escalatedToFaculty: false, status: { in: OPEN_STATUSES } };
  const assignedToMe = { ...ownedOpen, assignedToId: user.id };

  const [departments, statusRows, openRows, unassignedRows, mineRows, reopenRows, recentAssigned] = await Promise.all([
    departmentInfo(departmentIds),
    prisma.complaint.groupBy({
      by: ['departmentId', 'status'],
      where: { departmentId: { in: departmentIds }, scope: 'DEPARTMENT' },
      _count: { _all: true },
    }),
    prisma.complaint.groupBy({ by: ['departmentId'], where: ownedOpen, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ['departmentId'], where: { ...ownedOpen, assignedToId: null }, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ['departmentId', 'status'], where: assignedToMe, _count: { _all: true } }),
    prisma.complaintReopenRequest.groupBy({
      by: ['complaintId'],
      where: { status: 'PENDING', complaint: { departmentId: { in: departmentIds }, scope: 'DEPARTMENT', escalatedToFaculty: false, assignedToId: user.id } },
      _count: { _all: true },
    }),
    recentComplaints(user, { assignedToId: user.id, scope: 'DEPARTMENT' }, 5),
  ]);
  const reopenDecisions = reopenRows.length;

  return {
    departments: departments.map((department) => {
      const mineHere = toCounts(mineRows.filter((r) => r.departmentId === department.id) as unknown as StatusRow[]);
      return {
        department,
        queue: {
          byStatus: toCounts(statusRows.filter((r) => r.departmentId === department.id) as unknown as StatusRow[]),
          open: openRows.find((r) => r.departmentId === department.id)?._count._all ?? 0,
          unassigned: unassignedRows.find((r) => r.departmentId === department.id)?._count._all ?? 0,
        },
        assignedToMe: { byStatus: mineHere, open: total(mineHere) },
      };
    }),
    reopenDecisionsPending: reopenDecisions,
    recentAssigned,
  };
};

// ---- head of department -------------------------------------------------------------------------------------

const DAY_MS = 86_400_000;

const hodSection = async (user: AuthUser) => {
  const departmentIds = departmentIdsForRole(user, 'HOD');
  const dept = { departmentId: { in: departmentIds }, scope: 'DEPARTMENT' as const };
  const ownedOpen = { ...dept, escalatedToFaculty: false, status: { in: OPEN_STATUSES } };

  const [departments, statusRows, openRows, unassignedRows, escalatedRows, oldestRows, reopenRows, officers, workloadRows] =
    await Promise.all([
      departmentInfo(departmentIds),
      prisma.complaint.groupBy({ by: ['departmentId', 'status'], where: dept, _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ['departmentId'], where: ownedOpen, _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ['departmentId'], where: { ...ownedOpen, assignedToId: null }, _count: { _all: true } }),
      prisma.complaint.groupBy({ by: ['departmentId'], where: { ...dept, escalatedToFaculty: true }, _count: { _all: true } }),
      // No SLA exists, so this is only the AGE of the oldest open complaint, never an "overdue" flag.
      prisma.complaint.groupBy({ by: ['departmentId'], where: ownedOpen, _min: { createdAt: true } }),
      prisma.complaintReopenRequest.findMany({
        where: { status: 'PENDING', complaint: { ...dept, escalatedToFaculty: false } },
        select: { complaint: { select: { departmentId: true } } },
      }),
      prisma.departmentMembership.findMany({
        where: { departmentId: { in: departmentIds }, role: 'OFFICER', status: 'ACTIVE', user: { isActive: true } },
        select: { departmentId: true, user: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.complaint.groupBy({
        by: ['departmentId', 'assignedToId'],
        where: { ...ownedOpen, assignedToId: { not: null } },
        _count: { _all: true },
      }),
    ]);

  return {
    departments: departments.map((department) => {
      const byStatus = toCounts(statusRows.filter((r) => r.departmentId === department.id) as unknown as StatusRow[]);
      const oldest = oldestRows.find((r) => r.departmentId === department.id)?._min.createdAt ?? null;
      return {
        department,
        byStatus,
        open: openRows.find((r) => r.departmentId === department.id)?._count._all ?? 0,
        unassigned: unassignedRows.find((r) => r.departmentId === department.id)?._count._all ?? 0,
        escalated: escalatedRows.find((r) => r.departmentId === department.id)?._count._all ?? 0,
        oldestOpenAgeDays: oldest ? Math.floor((Date.now() - oldest.getTime()) / DAY_MS) : null,
        reopenPending: reopenRows.filter((r) => r.complaint.departmentId === department.id).length,
        // Each active Officer's current open workload (including those with none).
        officers: officers
          .filter((o) => o.departmentId === department.id)
          .map((o) => ({
            id: o.user.id,
            fullName: o.user.fullName,
            openAssigned:
              workloadRows.find((w) => w.departmentId === department.id && w.assignedToId === o.user.id)?._count._all ?? 0,
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName)),
      };
    }),
  };
};

// ---- faculty admin -------------------------------------------------------------------------------------------

// Only faculty-level complaints and cases escalated to the faculty. Never ordinary departmental complaints.
const facultyAdminSection = async (user: AuthUser) => {
  const facultyLevel = { scope: 'FACULTY' as const };
  const escalated = { escalatedToFaculty: true };
  const [facultyRows, escalatedRows, reopenPending, recent] = await Promise.all([
    prisma.complaint.groupBy({ by: ['status'], where: facultyLevel, _count: { _all: true } }),
    prisma.complaint.groupBy({ by: ['status'], where: escalated, _count: { _all: true } }),
    prisma.complaintReopenRequest.count({
      where: { status: 'PENDING', complaint: { OR: [facultyLevel, escalated] } },
    }),
    recentComplaints(user, { OR: [facultyLevel, escalated] }, 5),
  ]);
  const facultyCounts = toCounts(facultyRows);
  const escalatedCounts = toCounts(escalatedRows);
  return {
    facultyLevel: { byStatus: facultyCounts, open: sum(facultyCounts, OPEN_STATUSES) },
    escalated: { byStatus: escalatedCounts, total: total(escalatedCounts) },
    reopenPending,
    recent,
  };
};

// ---- the endpoint ---------------------------------------------------------------------------------------------

// One section per role the user actually holds (active memberships and faculty roles only).
export const getDashboardSummary = async (user: AuthUser) => {
  const roles = getUserRoles(user);
  const [unreadNotifications, student, officer, hod, facultyAdmin] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    roles.has('STUDENT') ? studentSection(user) : null,
    roles.has('OFFICER') ? officerSection(user) : null,
    roles.has('HOD') ? hodSection(user) : null,
    isFacultyAdmin(user) ? facultyAdminSection(user) : null,
  ]);
  return {
    roles: Array.from(roles),
    unreadNotifications,
    ...(student ? { student } : {}),
    ...(officer ? { officer } : {}),
    ...(hod ? { hod } : {}),
    ...(facultyAdmin ? { facultyAdmin } : {}),
  };
};
