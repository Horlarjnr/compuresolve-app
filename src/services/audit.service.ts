import { prisma } from '../utils/prisma';

// Works with the normal client or a transaction client (so the audit row commits or rolls back with the action).
type AuditClient = Pick<typeof prisma, 'auditLog'>;

type AuditEntry = {
  actorId?: string | null;
  departmentId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  // Never put tokens, passwords or emails here.
  metadata?: Record<string, string | null>;
};

export const recordAudit = (entry: AuditEntry, client: AuditClient = prisma) =>
  client.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      departmentId: entry.departmentId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata,
    },
  });
