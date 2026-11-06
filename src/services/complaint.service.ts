import { createError } from '../common/errors/app-error';
import { allowedTransitionsFor, canDecideReopen, REOPENABLE_STATUSES } from '../policies/complaint-workflow';
import { canViewComplaint, canViewComplaintAsStaff, complaintScopeWhere } from '../policies/complaint.policy';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { generateReference } from '../utils/reference';
import { departmentIdsForRole } from '../utils/roles';
import type { CreateComplaintInput, ListComplaintsQuery } from '../validators/complaint.validator';
import { recordAudit } from './audit.service';

const summarySelect = {
  id: true,
  reference: true,
  scope: true,
  departmentId: true,
  submittedById: true,
  assignedToId: true,
  title: true,
  status: true,
  priority: true,
  escalatedToFaculty: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, code: true } },
  category: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, fullName: true } },
  submittedBy: { select: { id: true, fullName: true, matricNumber: true } },
};

const detailSelect = {
  ...summarySelect,
  description: true,
  resolutionNote: true,
  resolvedAt: true,
  closedAt: true,
  reopenRequests: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      status: true,
      reason: true,
      decisionNote: true,
      decidedAt: true,
      createdAt: true,
      decidedBy: { select: { id: true, fullName: true } },
    },
  },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      reason: true,
      createdAt: true,
      actor: { select: { id: true, fullName: true } },
    },
  },
};

type SummaryRow = {
  id: string;
  reference: string;
  scope: string;
  departmentId: string | null;
  submittedById: string;
  assignedToId: string | null;
  title: string;
  status: string;
  priority: string;
  escalatedToFaculty: boolean;
  createdAt: Date;
  updatedAt: Date;
  department: { id: string; name: string; code: string } | null;
  category: { id: string; name: string };
  assignedTo: { id: string; fullName: string } | null;
  submittedBy: { id: string; fullName: string; matricNumber: string | null };
};

type DetailRow = SummaryRow & {
  description: string;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  closedAt: Date | null;
  reopenRequests: {
    id: string;
    status: string;
    reason: string;
    decisionNote: string | null;
    decidedAt: Date | null;
    createdAt: Date;
    decidedBy: { id: string; fullName: string } | null;
  }[];
  statusHistory: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    reason: string | null;
    createdAt: Date;
    actor: { id: string; fullName: string };
  }[];
};

// Two views of the same record. STAFF see who submitted it and who is handling it.
// The SUBMITTER sees their own complaint without staff identities.
const presentSummary = (user: AuthUser, row: SummaryRow) => {
  const base = {
    id: row.id,
    reference: row.reference,
    scope: row.scope,
    department: row.department,
    category: row.category,
    title: row.title,
    status: row.status,
    priority: row.priority,
    assigned: row.assignedToId !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (!canViewComplaintAsStaff(user, row)) return base;
  return {
    ...base,
    assignedTo: row.assignedTo,
    submittedBy: row.submittedBy,
    escalatedToFaculty: row.escalatedToFaculty,
  };
};

const presentDetail = (user: AuthUser, row: DetailRow) => {
  const staff = canViewComplaintAsStaff(user, row);
  const hasPendingReopen = row.reopenRequests.some((r) => r.status === 'PENDING');
  const isSubmitter = row.submittedById === user.id;
  return {
    ...presentSummary(user, row),
    description: row.description,
    resolutionNote: row.resolutionNote,
    resolvedAt: row.resolvedAt,
    closedAt: row.closedAt,
    // Staff only: the status changes this person may make right now.
    ...(staff ? { allowedTransitions: allowedTransitionsFor(user, row) } : {}),
    reopenRequests: row.reopenRequests.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      decisionNote: r.decisionNote, // written for the student
      decidedAt: r.decidedAt,
      createdAt: r.createdAt,
      ...(staff ? { decidedBy: r.decidedBy } : {}),
    })),
    // Submitter: may they ask for a reopen right now?
    ...(isSubmitter
      ? { canRequestReopen: (REOPENABLE_STATUSES as string[]).includes(row.status) && !hasPendingReopen }
      : {}),
    // Staff: is there a pending request they may decide?
    ...(staff ? { canDecideReopen: hasPendingReopen && canDecideReopen(user, row) } : {}),
    statusHistory: row.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      reason: h.reason, // reasons are written for the student: there are no internal notes in this system
      createdAt: h.createdAt,
      ...(staff ? { actor: h.actor } : {}),
    })),
  };
};

// Department, scope, submitter, status and priority are all decided HERE, never taken from the client.
export const createComplaint = async (user: AuthUser, input: CreateComplaintInput) => {
  const target = input.target;
  let departmentId: string | null = null;
  let codeForReference = 'FAC';

  if (target === 'DEPARTMENT') {
    const ownDepartments = departmentIdsForRole(user, 'STUDENT');
    if (input.departmentId) {
      if (!ownDepartments.includes(input.departmentId)) {
        throw createError(403, 'You can only submit complaints to your own department', 'FORBIDDEN_DEPARTMENT');
      }
      departmentId = input.departmentId;
    } else if (ownDepartments.length === 1) {
      departmentId = ownDepartments[0];
    } else {
      throw createError(400, 'Validation failed', 'VALIDATION_ERROR', [
        { field: 'departmentId', message: 'Select a department' },
      ]);
    }

    const department = await prisma.department.findFirst({
      where: { id: departmentId, isActive: true },
      select: { code: true },
    });
    if (!department) throw createError(400, 'Selected department is not available', 'INVALID_DEPARTMENT');
    codeForReference = department.code;
  }

  // The category must be active and belong to exactly the chosen target.
  const category = await prisma.complaintCategory.findFirst({
    where: { id: input.categoryId, isActive: true, scope: target, departmentId },
    select: { id: true },
  });
  if (!category) throw createError(400, 'Selected category is not available', 'INVALID_CATEGORY');

  // The complaint and its first history row are created together. A rare reference clash is retried.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.complaint.create({
          data: {
            reference: generateReference(codeForReference),
            scope: target,
            departmentId,
            submittedById: user.id,
            categoryId: category.id,
            title: input.title,
            description: input.description,
            statusHistory: { create: { actorId: user.id, fromStatus: null, toStatus: 'SUBMITTED' } },
          },
          select: detailSelect,
        });
        await recordAudit(
          {
            actorId: user.id,
            departmentId,
            action: 'complaint.submitted',
            entityType: 'Complaint',
            entityId: row.id,
          },
          tx,
        );
        return row;
      });
      return presentDetail(user, created as DetailRow);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && attempt < 5) continue;
      throw error;
    }
  }
  throw createError(500, 'Could not generate a unique reference', 'REFERENCE_FAILED');
};

// The access rule is ALWAYS the first condition. Filters can only narrow it, never widen it.
export const listComplaints = async (user: AuthUser, query: ListComplaintsQuery) => {
  const filters: object[] = [complaintScopeWhere(user)];
  if (query.status) filters.push({ status: query.status });
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.categoryId) filters.push({ categoryId: query.categoryId });
  if (query.assigned === 'me') filters.push({ assignedToId: user.id });
  if (query.assigned === 'none') filters.push({ assignedToId: null });
  if (query.q) {
    filters.push({
      OR: [
        { title: { contains: query.q, mode: 'insensitive' as const } },
        { reference: { contains: query.q, mode: 'insensitive' as const } },
      ],
    });
  }
  const where = { AND: filters };

  const [total, rows] = await prisma.$transaction([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      select: summarySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);
  return {
    items: rows.map((r) => presentSummary(user, r as SummaryRow)),
    meta: { page: query.page, limit: query.limit, total },
  };
};

export const getComplaint = async (user: AuthUser, complaintId: string) => {
  const row = await prisma.complaint.findUnique({ where: { id: complaintId }, select: detailSelect });
  // A complaint you may not see looks exactly like one that does not exist.
  if (!row || !canViewComplaint(user, row)) throw createError(404, 'Complaint not found');
  return presentDetail(user, row as DetailRow);
};
