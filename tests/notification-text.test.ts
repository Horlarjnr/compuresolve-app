import { describe, expect, test } from 'vitest';
import { statusLabel, statusNotificationTitle, statusNotificationType } from '../src/utils/notification-text';

describe('notification wording', () => {
  test('status labels read naturally', () => {
    expect(statusLabel('UNDER_REVIEW')).toBe('under review');
    expect(statusLabel('AWAITING_STUDENT')).toBe('awaiting student');
    expect(statusLabel('IN_PROGRESS')).toBe('in progress');
  });

  test('resolved and escalated have their own notification types; everything else is a status change', () => {
    expect(statusNotificationType('RESOLVED')).toBe('COMPLAINT_RESOLVED');
    expect(statusNotificationType('ESCALATED')).toBe('COMPLAINT_ESCALATED');
    for (const s of ['UNDER_REVIEW', 'IN_PROGRESS', 'AWAITING_STUDENT', 'CLOSED', 'REJECTED']) {
      expect(statusNotificationType(s)).toBe('STATUS_CHANGED');
    }
  });

  test('titles are short and generic', () => {
    expect(statusNotificationTitle('RESOLVED')).toBe('Complaint resolved');
    expect(statusNotificationTitle('ESCALATED')).toBe('Complaint escalated');
    expect(statusNotificationTitle('IN_PROGRESS')).toBe('Complaint update');
  });
});
