import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { EVENT_TYPES, eventSettingsSchema, parseSettings, type EventSettings } from "@/domain/settings";
import { resolveTemplateDate, TEMPLATES } from "@/domain/templates";
import { addDays, isIsoDate, isValidTimeZone, utcToZoned, zonedToUtc } from "@/lib/dates";
import type { DbExecutor } from "../db/connect";
import {
  activities,
  activityEligibleGroups,
  eventMembers,
  events,
  guestGroups,
  mealActivityLinks,
  mealDefinitions,
  users,
} from "../db/schema";
import { AppError, conflict, invalid, isUniqueViolation, notFound } from "../lib/errors";
import { requireEventAccess, type EventRole } from "./access";
import { audit } from "./audit";
import { syncAutoPermissions } from "./invitations";

const isoDate = z.string().refine(isIsoDate, "Use a valid date (YYYY-MM-DD).");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const eventInputSchema = z
  .object({
    name: z.string().trim().min(1, "Give your event a name.").max(160),
    description: optionalText(4000),
    hostDisplayName: optionalText(160),
    eventType: z.enum(EVENT_TYPES).default("custom"),
    timezone: z.string().refine(isValidTimeZone, "Unknown timezone.").default("Asia/Kolkata"),
    startDate: isoDate,
    endDate: isoDate,
    venueName: optionalText(200),
    venueAddress: optionalText(500),
    /** Local date-time in the event timezone, "YYYY-MM-DDTHH:mm". */
    rsvpDeadlineLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a valid deadline.")
      .optional()
      .nullable()
      .or(z.literal("").transform(() => null)),
    visibility: z.enum(["private", "link"]).default("private"),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "End date must be on or after the start date.", path: ["endDate"] })
  .refine((v) => v.endDate <= addDays(v.startDate, 60), { message: "Events can span at most 60 days.", path: ["endDate"] });

export type EventInput = z.input<typeof eventInputSchema>;

function deadlineToUtc(local: string | null | undefined, timezone: string): Date | null {
  if (!local) return null;
  const [date, time] = local.split("T");
  return zonedToUtc(date, time, timezone);
}

export async function createEvent(
  db: DbExecutor,
  userId: string,
  input: EventInput & { useTemplate?: boolean },
) {
  const data = eventInputSchema.parse(input);
  const template = TEMPLATES[data.eventType];
  const settings = eventSettingsSchema.parse({
    ...template.settings,
    features: { ...template.settings.features },
  });

  return db.transaction(async (tx) => {
    const [event] = await tx
      .insert(events)
      .values({
        ownerUserId: userId,
        name: data.name,
        description: data.description,
        hostDisplayName: data.hostDisplayName,
        eventType: data.eventType,
        timezone: data.timezone,
        startDate: data.startDate,
        endDate: data.endDate,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        rsvpDeadline: deadlineToUtc(data.rsvpDeadlineLocal, data.timezone),
        visibility: data.visibility,
        settings,
      })
      .returning();
    await tx.insert(eventMembers).values({ eventId: event.id, userId, role: "owner" });

    if (input.useTemplate !== false) {
      const created = new Map<string, string>();
      for (const [i, a] of template.activities.entries()) {
        const date = resolveTemplateDate(data.startDate, data.endDate, a.dayOffset);
        const startAt = zonedToUtc(date, a.time, data.timezone);
        const [row] = await tx
          .insert(activities)
          .values({
            eventId: event.id,
            name: a.name,
            description: a.description ?? null,
            startAt,
            endAt: new Date(startAt.getTime() + a.durationMinutes * 60_000),
            venueName: data.venueName,
            venueAddress: data.venueAddress,
            sortOrder: i,
          })
          .returning({ id: activities.id });
        created.set(a.name, row.id);
      }
      for (const [i, m] of template.meals.entries()) {
        const [meal] = await tx
          .insert(mealDefinitions)
          .values({
            eventId: event.id,
            name: m.name,
            serviceDate: resolveTemplateDate(data.startDate, data.endDate, m.dayOffset),
            serviceTime: m.time,
            basis: m.basis,
            sortOrder: i,
          })
          .returning({ id: mealDefinitions.id });
        const links = m.linkActivities.map((n) => created.get(n)).filter((id): id is string => !!id);
        if (links.length) {
          await tx.insert(mealActivityLinks).values(links.map((activityId) => ({ mealId: meal.id, activityId })));
        }
      }
      if (template.groups.length) {
        await tx.insert(guestGroups).values(template.groups.map((name) => ({ eventId: event.id, name })));
      }
    }

    await audit(tx, { kind: "user", userId }, {
      eventId: event.id,
      action: "event.created",
      entityType: "event",
      entityId: event.id,
      after: { name: event.name, eventType: event.eventType, template: input.useTemplate !== false },
    });
    return event;
  });
}

export async function listEventsForUser(db: DbExecutor, userId: string, { archived = false } = {}) {
  const guestCount = sql<number>`(select count(*)::int from guests g where g.event_id = ${events.id})`;
  const respondedCount = sql<number>`(select count(*)::int from invitations i where i.event_id = ${events.id} and i.status <> 'revoked' and i.response_status in ('submitted','updated'))`;
  const invitationCount = sql<number>`(select count(*)::int from invitations i where i.event_id = ${events.id} and i.status <> 'revoked')`;
  return db
    .select({
      id: events.id,
      name: events.name,
      eventType: events.eventType,
      startDate: events.startDate,
      endDate: events.endDate,
      status: events.status,
      venueName: events.venueName,
      role: eventMembers.role,
      guestCount,
      respondedCount,
      invitationCount,
      archivedAt: events.archivedAt,
    })
    .from(events)
    .innerJoin(eventMembers, and(eq(eventMembers.eventId, events.id), eq(eventMembers.userId, userId)))
    .where(archived ? isNotNull(events.archivedAt) : isNull(events.archivedAt))
    .orderBy(asc(events.startDate));
}

export async function updateEvent(db: DbExecutor, userId: string, eventId: string, input: EventInput) {
  const { event } = await requireEventAccess(db, userId, eventId, "admin");
  const data = eventInputSchema.parse(input);

  // Reject date changes that would orphan scheduled activities.
  const acts = await db.select().from(activities).where(eq(activities.eventId, eventId));
  const outside = acts.filter((a) => {
    const d = utcToZoned(a.startAt, data.timezone).date;
    return d < data.startDate || d > data.endDate;
  });
  if (outside.length) {
    throw invalid(
      `These activities fall outside the new dates: ${outside.map((a) => a.name).join(", ")}. Move them first.`,
    );
  }

  const [updated] = await db
    .update(events)
    .set({
      name: data.name,
      description: data.description,
      hostDisplayName: data.hostDisplayName,
      eventType: data.eventType,
      timezone: data.timezone,
      startDate: data.startDate,
      endDate: data.endDate,
      venueName: data.venueName,
      venueAddress: data.venueAddress,
      rsvpDeadline: deadlineToUtc(data.rsvpDeadlineLocal, data.timezone),
      visibility: data.visibility,
    })
    .where(eq(events.id, eventId))
    .returning();
  await audit(db, { kind: "user", userId }, {
    eventId,
    action: "event.updated",
    entityType: "event",
    entityId: eventId,
    before: { name: event.name, startDate: event.startDate, endDate: event.endDate },
    after: { name: updated.name, startDate: updated.startDate, endDate: updated.endDate },
  });
  return updated;
}

const objectPatch = z.record(z.string(), z.unknown());

/** Merges only the supplied keys onto the current settings, then validates the result. */
export async function updateEventSettings(db: DbExecutor, userId: string, eventId: string, patch: unknown) {
  const { event } = await requireEventAccess(db, userId, eventId, "admin");
  const current = parseSettings(event.settings);
  const p = objectPatch.parse(patch);
  const parsed = eventSettingsSchema.safeParse({
    ...current,
    ...p,
    features: { ...current.features, ...objectPatch.optional().parse(p.features) },
    theme: { ...current.theme, ...objectPatch.optional().parse(p.theme) },
  });
  if (!parsed.success) throw invalid(parsed.error.issues[0].message);
  const next: EventSettings = parsed.data;
  await db.update(events).set({ settings: next }).where(eq(events.id, eventId));
  await audit(db, { kind: "user", userId }, {
    eventId,
    action: "event.settings_updated",
    entityType: "event",
    entityId: eventId,
    after: p,
  });
  return next;
}

export async function setEventStatus(
  db: DbExecutor,
  userId: string,
  eventId: string,
  status: "draft" | "published",
) {
  await requireEventAccess(db, userId, eventId, "admin");
  await db.update(events).set({ status }).where(eq(events.id, eventId));
  await audit(db, { kind: "user", userId }, { eventId, action: `event.${status}`, entityType: "event", entityId: eventId });
}

export async function archiveEvent(db: DbExecutor, userId: string, eventId: string, archive: boolean) {
  await requireEventAccess(db, userId, eventId, "admin");
  await db
    .update(events)
    .set({ archivedAt: archive ? new Date() : null, status: archive ? "archived" : "draft" })
    .where(eq(events.id, eventId));
  await audit(db, { kind: "user", userId }, {
    eventId,
    action: archive ? "event.archived" : "event.restored",
    entityType: "event",
    entityId: eventId,
  });
}

/** Permanently deletes the event and all guest data (cascades). Requires the exact event name. */
export async function deleteEvent(db: DbExecutor, userId: string, eventId: string, confirmName: string) {
  const { event } = await requireEventAccess(db, userId, eventId, "admin");
  if (confirmName.trim() !== event.name) throw invalid("Type the event name exactly to confirm deletion.");
  await db.delete(events).where(eq(events.id, eventId));
}

/** Copies configuration (activities, meals, groups, questions, settings) but no guests or responses. */
export async function duplicateEvent(db: DbExecutor, userId: string, eventId: string, newStartDate?: string) {
  const { event } = await requireEventAccess(db, userId, eventId, "manage");
  const shiftDays =
    newStartDate && isIsoDate(newStartDate)
      ? Math.round((Date.parse(newStartDate) - Date.parse(event.startDate)) / 86_400_000)
      : 0;
  const shiftMs = shiftDays * 86_400_000;

  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(events)
      .values({
        ...event,
        id: undefined,
        ownerUserId: userId,
        name: `${event.name} (copy)`,
        startDate: addDays(event.startDate, shiftDays),
        endDate: addDays(event.endDate, shiftDays),
        rsvpDeadline: event.rsvpDeadline ? new Date(event.rsvpDeadline.getTime() + shiftMs) : null,
        status: "draft",
        archivedAt: null,
        createdAt: undefined,
        updatedAt: undefined,
      })
      .returning();
    await tx.insert(eventMembers).values({ eventId: copy.id, userId, role: "owner" });

    const groupMap = new Map<string, string>();
    for (const g of await tx.select().from(guestGroups).where(eq(guestGroups.eventId, eventId))) {
      const [n] = await tx
        .insert(guestGroups)
        .values({ eventId: copy.id, name: g.name, description: g.description })
        .returning({ id: guestGroups.id });
      groupMap.set(g.id, n.id);
    }
    const actMap = new Map<string, string>();
    for (const a of await tx.select().from(activities).where(eq(activities.eventId, eventId))) {
      const [n] = await tx
        .insert(activities)
        .values({
          ...a,
          id: undefined,
          eventId: copy.id,
          startAt: new Date(a.startAt.getTime() + shiftMs),
          endAt: a.endAt ? new Date(a.endAt.getTime() + shiftMs) : null,
          createdAt: undefined,
          updatedAt: undefined,
        })
        .returning({ id: activities.id });
      actMap.set(a.id, n.id);
    }
    if (actMap.size) {
      const elig = await tx
        .select()
        .from(activityEligibleGroups)
        .where(inArray(activityEligibleGroups.activityId, [...actMap.keys()]));
      const rows = elig
        .map((e) => ({ activityId: actMap.get(e.activityId)!, guestGroupId: groupMap.get(e.guestGroupId)! }))
        .filter((r) => r.activityId && r.guestGroupId);
      if (rows.length) await tx.insert(activityEligibleGroups).values(rows);
    }
    for (const m of await tx.select().from(mealDefinitions).where(eq(mealDefinitions.eventId, eventId))) {
      const [n] = await tx
        .insert(mealDefinitions)
        .values({ ...m, id: undefined, eventId: copy.id, serviceDate: addDays(m.serviceDate, shiftDays), createdAt: undefined })
        .returning({ id: mealDefinitions.id });
      const links = await tx.select().from(mealActivityLinks).where(eq(mealActivityLinks.mealId, m.id));
      const rows = links.map((l) => ({ mealId: n.id, activityId: actMap.get(l.activityId)! })).filter((r) => r.activityId);
      if (rows.length) await tx.insert(mealActivityLinks).values(rows);
    }
    await audit(tx, { kind: "user", userId }, {
      eventId: copy.id,
      action: "event.duplicated",
      entityType: "event",
      entityId: copy.id,
      after: { sourceEventId: eventId },
    });
    return copy;
  });
}

// ---------------------------------------------------------------------------
// Collaborators
// ---------------------------------------------------------------------------

export async function listCollaborators(db: DbExecutor, userId: string, eventId: string) {
  await requireEventAccess(db, userId, eventId, "view");
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: eventMembers.role, addedAt: eventMembers.createdAt })
    .from(eventMembers)
    .innerJoin(users, eq(users.id, eventMembers.userId))
    .where(eq(eventMembers.eventId, eventId))
    .orderBy(asc(eventMembers.createdAt));
}

export async function addCollaborator(
  db: DbExecutor,
  userId: string,
  eventId: string,
  input: { email: string; role: Exclude<EventRole, "owner"> },
) {
  await requireEventAccess(db, userId, eventId, "admin");
  const role = z.enum(["organizer", "viewer"]).parse(input.role);
  const email = z.email().parse(input.email.trim().toLowerCase());
  const [target] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
  if (!target) {
    throw new AppError("not_found", "No Gatherly account uses that email yet. Ask them to sign up, then add them.");
  }
  try {
    await db.insert(eventMembers).values({ eventId, userId: target.id, role });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("That person already has access to this event.");
    throw e;
  }
  await audit(db, { kind: "user", userId }, {
    eventId,
    action: "collaborator.added",
    entityType: "event_member",
    entityId: target.id,
    after: { role },
  });
}

export async function removeCollaborator(db: DbExecutor, userId: string, eventId: string, memberUserId: string) {
  const { event } = await requireEventAccess(db, userId, eventId, "admin");
  if (memberUserId === event.ownerUserId) throw invalid("The owner cannot be removed.");
  const removed = await db
    .delete(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), eq(eventMembers.userId, memberUserId)))
    .returning();
  if (!removed.length) throw notFound("Collaborator");
  await audit(db, { kind: "user", userId }, {
    eventId,
    action: "collaborator.removed",
    entityType: "event_member",
    entityId: memberUserId,
  });
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time (HH:MM).");

export const activityInputSchema = z.object({
  name: z.string().trim().min(1, "Name the activity.").max(160),
  description: optionalText(2000),
  date: isoDate,
  startTime: timeStr,
  endTime: timeStr.optional().nullable().or(z.literal("").transform(() => null)),
  venueName: optionalText(200),
  venueAddress: optionalText(500),
  attendanceRequested: z.boolean().default(true),
  allowDecline: z.boolean().default(true),
  capacity: z.coerce.number().int().positive().max(100000).optional().nullable(),
  eligibility: z.enum(["all", "groups"]).default("all"),
  eligibleGroupIds: z.array(z.uuid()).default([]),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

async function validateActivity(db: DbExecutor, event: { id: string; startDate: string; endDate: string; timezone: string }, input: ActivityInput) {
  const data = activityInputSchema.parse(input);
  if (data.date < event.startDate || data.date > event.endDate) {
    throw invalid(`The activity date must be between ${event.startDate} and ${event.endDate}.`);
  }
  const startAt = zonedToUtc(data.date, data.startTime, event.timezone);
  let endAt: Date | null = null;
  if (data.endTime) {
    endAt = zonedToUtc(data.date, data.endTime, event.timezone);
    // An end time earlier than the start runs past midnight.
    if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
  }
  if (data.eligibility === "groups") {
    if (!data.eligibleGroupIds.length) throw invalid("Choose at least one guest group, or open the activity to everyone.");
    const found = await db
      .select({ id: guestGroups.id })
      .from(guestGroups)
      .where(and(eq(guestGroups.eventId, event.id), inArray(guestGroups.id, data.eligibleGroupIds)));
    if (found.length !== new Set(data.eligibleGroupIds).size) throw invalid("Unknown guest group.");
  }
  return { data, startAt, endAt };
}

export async function listActivities(db: DbExecutor, eventId: string) {
  const rows = await db
    .select()
    .from(activities)
    .where(eq(activities.eventId, eventId))
    .orderBy(asc(activities.startAt), asc(activities.sortOrder));
  const elig = rows.length
    ? await db
        .select()
        .from(activityEligibleGroups)
        .where(inArray(activityEligibleGroups.activityId, rows.map((r) => r.id)))
    : [];
  return rows.map((r) => ({
    ...r,
    eligibleGroupIds: elig.filter((e) => e.activityId === r.id).map((e) => e.guestGroupId),
  }));
}

export async function createActivity(db: DbExecutor, userId: string, eventId: string, input: ActivityInput) {
  const { event } = await requireEventAccess(db, userId, eventId, "manage");
  const { data, startAt, endAt } = await validateActivity(db, event, input);
  return db.transaction(async (tx) => {
    const [{ maxOrder }] = await tx
      .select({ maxOrder: sql<number>`coalesce(max(${activities.sortOrder}), -1)::int` })
      .from(activities)
      .where(eq(activities.eventId, eventId));
    const [row] = await tx
      .insert(activities)
      .values({
        eventId,
        name: data.name,
        description: data.description,
        startAt,
        endAt,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        attendanceRequested: data.attendanceRequested,
        allowDecline: data.allowDecline,
        capacity: data.capacity ?? null,
        eligibility: data.eligibility,
        sortOrder: maxOrder + 1,
      })
      .returning();
    if (data.eligibility === "groups") {
      await tx.insert(activityEligibleGroups).values(data.eligibleGroupIds.map((guestGroupId) => ({ activityId: row.id, guestGroupId })));
    }
    await syncAutoPermissions(tx, eventId);
    await audit(tx, { kind: "user", userId }, {
      eventId,
      action: "activity.created",
      entityType: "activity",
      entityId: row.id,
      after: { name: row.name },
    });
    return row;
  });
}

async function loadActivity(db: DbExecutor, userId: string, activityId: string) {
  const [act] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!act) throw notFound("Activity");
  const access = await requireEventAccess(db, userId, act.eventId, "manage");
  return { act, ...access };
}

export async function updateActivity(db: DbExecutor, userId: string, activityId: string, input: ActivityInput) {
  const { act, event } = await loadActivity(db, userId, activityId);
  const { data, startAt, endAt } = await validateActivity(db, event, input);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(activities)
      .set({
        name: data.name,
        description: data.description,
        startAt,
        endAt,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        attendanceRequested: data.attendanceRequested,
        allowDecline: data.allowDecline,
        capacity: data.capacity ?? null,
        eligibility: data.eligibility,
      })
      .where(eq(activities.id, activityId))
      .returning();
    await tx.delete(activityEligibleGroups).where(eq(activityEligibleGroups.activityId, activityId));
    if (data.eligibility === "groups") {
      await tx.insert(activityEligibleGroups).values(data.eligibleGroupIds.map((guestGroupId) => ({ activityId, guestGroupId })));
    }
    await syncAutoPermissions(tx, act.eventId);
    await audit(tx, { kind: "user", userId }, {
      eventId: act.eventId,
      action: "activity.updated",
      entityType: "activity",
      entityId: activityId,
      before: { name: act.name, startAt: act.startAt },
      after: { name: row.name, startAt: row.startAt },
    });
    return row;
  });
}

export async function deleteActivity(db: DbExecutor, userId: string, activityId: string) {
  const { act } = await loadActivity(db, userId, activityId);
  await db.transaction(async (tx) => {
    await tx.delete(activities).where(eq(activities.id, activityId));
    await audit(tx, { kind: "user", userId }, {
      eventId: act.eventId,
      action: "activity.deleted",
      entityType: "activity",
      entityId: activityId,
      before: { name: act.name },
    });
  });
}

export async function reorderActivities(db: DbExecutor, userId: string, eventId: string, orderedIds: string[]) {
  await requireEventAccess(db, userId, eventId, "manage");
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(activities).set({ sortOrder: i }).where(and(eq(activities.id, id), eq(activities.eventId, eventId)));
    }
  });
}

export async function getEventOverviewMeta(db: DbExecutor, userId: string, eventId: string) {
  const access = await requireEventAccess(db, userId, eventId, "view");
  return { ...access, settings: parseSettings(access.event.settings) };
}

