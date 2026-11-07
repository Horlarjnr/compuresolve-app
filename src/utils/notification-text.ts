// Pure helpers (no database) so the wording rules are easy to test.
// Notification text is deliberately short and generic: the reference and the event only.
// It never contains message text, reasons or names.

export type NotificationTypeName =
  | 'COMPLAINT_SUBMITTED'
  | 'COMPLAINT_ASSIGNED'
  | 'STATUS_CHANGED'
  | 'MESSAGE_RECEIVED'
  | 'COMPLAINT_ESCALATED'
  | 'COMPLAINT_RESOLVED'
  | 'REOPEN_REQUESTED'
  | 'REOPEN_REQUEST_DECIDED';

export const statusLabel = (status: string) => status.replace(/_/g, ' ').toLowerCase();

export const statusNotificationType = (status: string): NotificationTypeName => {
  if (status === 'RESOLVED') return 'COMPLAINT_RESOLVED';
  if (status === 'ESCALATED') return 'COMPLAINT_ESCALATED';
  return 'STATUS_CHANGED';
};

export const statusNotificationTitle = (status: string) => {
  if (status === 'RESOLVED') return 'Complaint resolved';
  if (status === 'ESCALATED') return 'Complaint escalated';
  return 'Complaint update';
};
