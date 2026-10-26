import { desc, eq } from "drizzle-orm";
import type { DbExecutor } from "../db/connect";
import { auditLogs, users } from "../db/schema";

export type Actor =
  | { kind: "user"; userId: string }
  | { kind: "invitation"; invitationId: string }
  | { kind: "system" };

export interface AuditEntry {
  eventId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Keep these to identifiers and changed fields; avoid copying contact details. */
  before?: unknown;
  after?: unknown;
}

export async function audit(db: DbExecutor, actor: Actor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    eventId: entry.eventId,
    actorUserId: actor.kind === "user" ? actor.userId : null,
    actorInvitationId: actor.kind === "invitation" ? actor.invitationId : null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    beforeState: entry.before ?? null,
    afterState: entry.after ?? null,
  });
}

export async function listAudit(db: DbExecutor, eventId: string, limit = 50) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      actorName: users.name,
      actorInvitationId: auditLogs.actorInvitationId,
      after: auditLogs.afterState,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(eq(auditLogs.eventId, eventId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
