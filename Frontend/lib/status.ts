// The eight complaint statuses and their badge colours. There is deliberately no "overdue" status: the product has no SLA.
export const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'CLOSED', 'REJECTED'] as const;

export const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  SUBMITTED: { label: 'Submitted', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', dot: '#4F46E5' },
  UNDER_REVIEW: { label: 'Under review', cls: 'bg-amber-50 text-amber-700 border-amber-200', dot: '#D97706' },
  AWAITING_STUDENT: { label: 'Awaiting student', cls: 'bg-purple-50 text-purple-700 border-purple-200', dot: '#7C3AED' },
  IN_PROGRESS: { label: 'In progress', cls: 'bg-blue-50 text-blue-700 border-blue-200', dot: '#2563EB' },
  ESCALATED: { label: 'Escalated', cls: 'bg-red-50 text-red-600 border-red-200', dot: '#DC2626' },
  RESOLVED: { label: 'Resolved', cls: 'bg-green-50 text-green-700 border-green-200', dot: '#16A34A' },
  CLOSED: { label: 'Closed', cls: 'bg-gray-100 text-gray-600 border-gray-200', dot: '#6B7280' },
  REJECTED: { label: 'Rejected', cls: 'bg-red-100 text-red-900 border-red-300', dot: '#7F1D1D' },
};

export const statusLabel = (s: string) => STATUS_META[s]?.label ?? s;

// Statuses that need a written reason (shown to the student). Mirrors the backend policy.
export const REASON_REQUIRED = ['REJECTED', 'ESCALATED', 'RESOLVED', 'AWAITING_STUDENT'];

export const OPEN_STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'AWAITING_STUDENT', 'IN_PROGRESS', 'ESCALATED'];
