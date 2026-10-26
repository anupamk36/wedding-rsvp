import { and, eq, isNull } from "drizzle-orm";
import type { DbExecutor } from "../db/connect";
import { eventMembers, events } from "../db/schema";
import { forbidden, notFound } from "../lib/errors";

export type EventRole = "owner" | "organizer" | "viewer";
/** view: read dashboards; manage: guests, invitations, schedule, logistics, exports; admin: settings, collaborators, deletion. */
export type AccessLevel = "view" | "manage" | "admin";

const ALLOWED: Record<AccessLevel, EventRole[]> = {
  view: ["owner", "organizer", "viewer"],
  manage: ["owner", "organizer"],
  admin: ["owner"],
};

export type EventRow = typeof events.$inferSelect;

export interface EventAccess {
  event: EventRow;
  role: EventRole;
}

export function roleAllows(role: EventRole, level: AccessLevel): boolean {
  return ALLOWED[level].includes(role);
}

/**
 * Loads an event for a user and enforces their role. Returns 404 (not 403) when
 * the user has no membership so event ids cannot be probed.
 */
export async function requireEventAccess(
  db: DbExecutor,
  userId: string,
  eventId: string,
  level: AccessLevel,
): Promise<EventAccess> {
  if (!isUuid(eventId)) throw notFound("Event");
  const [row] = await db
    .select({ event: events, role: eventMembers.role })
    .from(events)
    .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(and(eq(events.id, eventId), isNull(events.archivedAt)))
    .limit(1);
  if (!row) {
    // Archived events remain readable by their owner.
    const [archived] = await db
      .select({ event: events, role: eventMembers.role })
      .from(events)
      .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
      .where(eq(events.id, eventId))
      .limit(1);
    if (!archived || archived.role !== "owner") throw notFound("Event");
    if (level !== "view" && level !== "admin") throw forbidden("Restore this event before editing it.");
    return archived;
  }
  if (!roleAllows(row.role, level)) throw forbidden();
  return row;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
