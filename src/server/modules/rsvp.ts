import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { parseSettings, type EventSettings } from "@/domain/settings";
import { addDays, isIsoDate } from "@/lib/dates";
import type { DbExecutor } from "../db/connect";
import {
  accommodationAssignments,
  accommodationRequestGuests,
  accommodationRequests,
  activities,
  activityAttendance,
  customAnswers,
  customQuestions,
  eventMembers,
  events,
  guests,
  households,
  invitationActivityPermissions,
  invitations,
  mealActivityLinks,
  mealDefinitions,
  mealOverrides,
  responseSubmissions,
  transportRequestGuests,
  transportRequests,
  users,
} from "../db/schema";
import { AppError, conflict, invalid, notFound } from "../lib/errors";
import { requireEventAccess } from "./access";
import { audit, type Actor } from "./audit";
import { enqueueNotification } from "./notifications";
import type { InvitationRow, ResolvedInvitation } from "./invitations";

type EventRow = typeof events.$inferSelect;
type Status = "attending" | "not_attending" | "maybe";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

export interface RsvpView {
  event: {
    id: string;
    name: string;
    description: string | null;
    hostDisplayName: string | null;
    eventType: string;
    timezone: string;
    startDate: string;
    endDate: string;
    venueName: string | null;
    venueAddress: string | null;
    rsvpDeadline: string | null;
    settings: Pick<
      EventSettings,
      "allowMaybe" | "availabilityMode" | "features" | "dietaryOptions" | "theme" | "allowGuestEdits" | "latePolicy"
    >;
  };
  invitation: {
    id: string;
    label: string;
    plusOnesAllowed: number;
    responseStatus: InvitationRow["responseStatus"];
    responseVersion: number;
    lastRespondedAt: string | null;
    /** Why the guest cannot edit, when they cannot. */
    lockedReason: "deadline" | "edits_disabled" | null;
    isLate: boolean;
  };
  activities: {
    id: string;
    name: string;
    description: string | null;
    startAt: string;
    endAt: string | null;
    venueName: string | null;
    venueAddress: string | null;
    attendanceRequested: boolean;
    allowDecline: boolean;
    isFull: boolean;
  }[];
  people: {
    id: string;
    name: string;
    isPlusOne: boolean;
    relationship: string | null;
    dietary: string[];
    dietaryNotes: string | null;
    accessibilityNeeds: string | null;
  }[];
  attendance: { guestId: string; activityId: string; status: Status }[];
  accommodation: {
    id: string;
    arrivalDate: string;
    departureDate: string;
    guestIds: string[];
    roomCount: number | null;
    roomSharing: string | null;
    notes: string | null;
    confirmed: boolean;
  }[];
  meals: {
    id: string;
    name: string;
    serviceDate: string;
    serviceTime: string | null;
    basis: "activity" | "overnight" | "manual";
    activityIds: string[];
    guestCanOptOut: boolean;
  }[];
  mealOptOuts: { guestId: string; mealId: string }[];
  transport: {
    id: string;
    direction: "arrival" | "departure" | "local";
    travelDate: string;
    travelTime: string | null;
    location: string;
    guestIds: string[];
    notes: string | null;
  }[];
  questions: {
    id: string;
    activityId: string | null;
    questionText: string;
    questionType: "short_text" | "long_text" | "single_choice" | "multi_choice" | "boolean" | "number";
    options: string[] | null;
    isRequired: boolean;
  }[];
  answers: Record<string, unknown>;
  notes: string | null;
}

async function scopePeople(db: DbExecutor, inv: InvitationRow) {
  return db
    .select()
    .from(guests)
    .where(
      and(
        eq(guests.eventId, inv.eventId),
        sql`(${guests.plusOneOfInvitationId} = ${inv.id}
          or ${inv.guestId ? sql`${guests.id} = ${inv.guestId}` : sql`false`}
          or ${inv.householdId ? sql`(${guests.householdId} = ${inv.householdId} and ${guests.plusOneOfInvitationId} is null)` : sql`false`})`,
      ),
    )
    .orderBy(sql`${guests.plusOneOfInvitationId} is not null`, asc(guests.createdAt), asc(guests.id));
}

async function invitationLabel(db: DbExecutor, inv: InvitationRow): Promise<string> {
  if (inv.householdId) {
    const [h] = await db.select({ name: households.name }).from(households).where(eq(households.id, inv.householdId));
    return h?.name ?? "Your household";
  }
  const [g] = await db.select({ name: guests.name }).from(guests).where(eq(guests.id, inv.guestId!));
  return g?.name ?? "Guest";
}

export function editLock(
  event: Pick<EventRow, "rsvpDeadline">,
  settings: EventSettings,
  inv: Pick<InvitationRow, "responseStatus">,
  now = new Date(),
): { lockedReason: RsvpView["invitation"]["lockedReason"]; isLate: boolean } {
  const pastDeadline = !!event.rsvpDeadline && now > event.rsvpDeadline;
  const hasResponded = inv.responseStatus === "submitted" || inv.responseStatus === "updated";
  if (!settings.allowGuestEdits && hasResponded) return { lockedReason: "edits_disabled", isLate: pastDeadline };
  if (pastDeadline && settings.latePolicy === "reject") return { lockedReason: "deadline", isLate: true };
  return { lockedReason: null, isLate: pastDeadline };
}

export async function getRsvpView(db: DbExecutor, { invitation: inv, event }: ResolvedInvitation): Promise<RsvpView> {
  const settings = parseSettings(event.settings);
  const people = await scopePeople(db, inv);
  const personIds = people.map((p) => p.id);

  const acts = await db
    .select({
      a: activities,
      attendingCount: sql<number>`(select count(*)::int from activity_attendance aa where aa.activity_id = ${activities.id} and aa.status = 'attending')`,
    })
    .from(activities)
    .innerJoin(
      invitationActivityPermissions,
      and(eq(invitationActivityPermissions.activityId, activities.id), eq(invitationActivityPermissions.invitationId, inv.id)),
    )
    .orderBy(asc(activities.startAt), asc(activities.sortOrder));
  const activityIds = acts.map((r) => r.a.id);

  const attendance = personIds.length && activityIds.length
    ? await db
        .select({ guestId: activityAttendance.guestId, activityId: activityAttendance.activityId, status: activityAttendance.status })
        .from(activityAttendance)
        .where(and(inArray(activityAttendance.guestId, personIds), inArray(activityAttendance.activityId, activityIds)))
    : [];
  const ownAttending = new Map<string, number>();
  for (const a of attendance) if (a.status === "attending") ownAttending.set(a.activityId, (ownAttending.get(a.activityId) ?? 0) + 1);

  const accRows = await db
    .select()
    .from(accommodationRequests)
    .where(and(eq(accommodationRequests.invitationId, inv.id), eq(accommodationRequests.status, "requested")))
    .orderBy(asc(accommodationRequests.arrivalDate));
  const accGuests = accRows.length
    ? await db.select().from(accommodationRequestGuests).where(inArray(accommodationRequestGuests.requestId, accRows.map((r) => r.id)))
    : [];
  const confirmedAssignments = accRows.length
    ? await db
        .select({ requestId: accommodationAssignments.requestId })
        .from(accommodationAssignments)
        .where(and(inArray(accommodationAssignments.requestId, accRows.map((r) => r.id)), eq(accommodationAssignments.status, "confirmed")))
    : [];

  const meals = settings.features.meals
    ? await db.select().from(mealDefinitions).where(eq(mealDefinitions.eventId, event.id)).orderBy(asc(mealDefinitions.serviceDate), asc(mealDefinitions.serviceTime))
    : [];
  const links = meals.length
    ? await db.select().from(mealActivityLinks).where(inArray(mealActivityLinks.mealId, meals.map((m) => m.id)))
    : [];
  const visibleMeals = meals
    .map((m) => ({ ...m, activityIds: links.filter((l) => l.mealId === m.id).map((l) => l.activityId) }))
    .filter((m) =>
      m.basis === "activity" ? m.activityIds.some((id) => activityIds.includes(id)) : m.basis === "overnight" && settings.features.accommodation,
    );
  const optOuts = personIds.length && visibleMeals.length
    ? await db
        .select({ guestId: mealOverrides.guestId, mealId: mealOverrides.mealId })
        .from(mealOverrides)
        .where(and(inArray(mealOverrides.guestId, personIds), eq(mealOverrides.override, "opted_out")))
    : [];

  const trRows = await db
    .select()
    .from(transportRequests)
    .where(and(eq(transportRequests.invitationId, inv.id), sql`${transportRequests.status} <> 'cancelled'`))
    .orderBy(asc(transportRequests.travelDate));
  const trGuests = trRows.length
    ? await db.select().from(transportRequestGuests).where(inArray(transportRequestGuests.requestId, trRows.map((r) => r.id)))
    : [];

  const questions = (
    await db.select().from(customQuestions).where(eq(customQuestions.eventId, event.id)).orderBy(asc(customQuestions.sortOrder))
  ).filter((q) => !q.activityId || activityIds.includes(q.activityId));
  const answers = await db.select().from(customAnswers).where(eq(customAnswers.invitationId, inv.id));

  const lock = editLock(event, settings, inv);

  return {
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      hostDisplayName: event.hostDisplayName,
      eventType: event.eventType,
      timezone: event.timezone,
      startDate: event.startDate,
      endDate: event.endDate,
      venueName: event.venueName,
      venueAddress: event.venueAddress,
      rsvpDeadline: event.rsvpDeadline?.toISOString() ?? null,
      settings: {
        allowMaybe: settings.allowMaybe,
        availabilityMode: settings.availabilityMode,
        features: settings.features,
        dietaryOptions: settings.dietaryOptions,
        theme: settings.theme,
        allowGuestEdits: settings.allowGuestEdits,
        latePolicy: settings.latePolicy,
      },
    },
    invitation: {
      id: inv.id,
      label: await invitationLabel(db, inv),
      plusOnesAllowed: inv.plusOnesAllowed,
      responseStatus: inv.responseStatus,
      responseVersion: inv.responseVersion,
      lastRespondedAt: inv.lastRespondedAt?.toISOString() ?? null,
      lockedReason: lock.lockedReason,
      isLate: lock.isLate,
    },
    activities: acts.map(({ a, attendingCount }) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      startAt: a.startAt.toISOString(),
      endAt: a.endAt?.toISOString() ?? null,
      venueName: a.venueName,
      venueAddress: a.venueAddress,
      attendanceRequested: a.attendanceRequested,
      allowDecline: a.allowDecline,
      // Full only counting other parties' seats, so a guest can keep their own.
      isFull: a.capacity != null && attendingCount - (ownAttending.get(a.id) ?? 0) >= a.capacity,
    })),
    people: people.map((p) => ({
      id: p.id,
      name: p.name,
      isPlusOne: !!p.plusOneOfInvitationId,
      relationship: p.relationship,
      dietary: p.dietary,
      dietaryNotes: p.dietaryNotes,
      accessibilityNeeds: p.accessibilityNeeds,
    })),
    attendance,
    accommodation: accRows.map((r) => ({
      id: r.id,
      arrivalDate: r.arrivalDate,
      departureDate: r.departureDate,
      guestIds: accGuests.filter((g) => g.requestId === r.id).map((g) => g.guestId),
      roomCount: r.roomCountRequested,
      roomSharing: r.roomSharingPreference,
      notes: r.notes,
      confirmed: confirmedAssignments.some((c) => c.requestId === r.id),
    })),
    meals: visibleMeals.map((m) => ({
      id: m.id,
      name: m.name,
      serviceDate: m.serviceDate,
      serviceTime: m.serviceTime?.slice(0, 5) ?? null,
      basis: m.basis,
      activityIds: m.activityIds,
      guestCanOptOut: m.guestCanOptOut,
    })),
    mealOptOuts: optOuts.filter((o) => visibleMeals.some((m) => m.id === o.mealId)),
    transport: trRows.map((r) => ({
      id: r.id,
      direction: r.direction,
      travelDate: r.travelDate,
      travelTime: r.travelTime?.slice(0, 5) ?? null,
      location: r.location,
      guestIds: trGuests.filter((g) => g.requestId === r.id).map((g) => g.guestId),
      notes: r.notes,
    })),
    questions: questions.map((q) => ({
      id: q.id,
      activityId: q.activityId,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options ?? null,
      isRequired: q.isRequired,
    })),
    answers: Object.fromEntries(answers.map((a) => [a.questionId, a.answer])),
    notes: inv.respondentNotes,
  };
}

// ---------------------------------------------------------------------------
// Submission
// ---------------------------------------------------------------------------

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const personKey = z.string().min(1).max(64);
const isoDate = z.string().refine(isIsoDate, "Use a valid date.");

export const responsePayloadSchema = z.object({
  expectedVersion: z.number().int().min(0),
  people: z
    .array(
      z.object({
        key: personKey,
        name: text(160),
        dietary: z.array(z.string().max(40)).max(20).default([]),
        dietaryNotes: text(500),
        accessibilityNeeds: text(500),
      }),
    )
    .max(50),
  attendance: z
    .array(z.object({ personKey, activityId: z.uuid(), status: z.enum(["attending", "not_attending", "maybe"]) }))
    .max(2000),
  accommodation: z
    .array(
      z.object({
        id: z.uuid().optional(),
        arrivalDate: isoDate,
        departureDate: isoDate,
        personKeys: z.array(personKey).min(1, "Choose who needs accommodation.").max(50),
        roomCount: z.number().int().min(1).max(20).nullish(),
        roomSharing: text(300),
        notes: text(1000),
      }),
    )
    .max(10)
    .default([]),
  mealOptOuts: z.array(z.object({ personKey, mealId: z.uuid() })).max(2000).default([]),
  transport: z
    .array(
      z.object({
        id: z.uuid().optional(),
        direction: z.enum(["arrival", "departure", "local"]),
        travelDate: isoDate,
        travelTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullish()
          .or(z.literal("").transform(() => null)),
        location: z.string().trim().min(1, "Enter a pickup or drop-off location.").max(300),
        personKeys: z.array(personKey).min(1, "Choose who needs transport.").max(50),
        notes: text(1000),
      }),
    )
    .max(10)
    .default([]),
  answers: z.array(z.object({ questionId: z.uuid(), value: z.unknown() })).max(100).default([]),
  notes: text(2000),
});
export type ResponsePayload = z.input<typeof responsePayloadSchema>;

export interface SubmitResult {
  version: number;
  responseStatus: InvitationRow["responseStatus"];
  isLate: boolean;
  changes: ChangeEntry[];
}

export type ChangeEntry =
  | { type: "attendance"; guest: string; activity: string; from: Status | null; to: Status | null }
  | { type: "plus_one"; guest: string; change: "added" | "removed" }
  | { type: "logistics"; area: "accommodation" | "transport"; summary: string };

function validateAnswer(q: typeof customQuestions.$inferSelect, value: unknown): unknown {
  const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  if (empty) return null;
  const opts = q.options ?? [];
  switch (q.questionType) {
    case "short_text":
      return z.string().trim().max(300).parse(value);
    case "long_text":
      return z.string().trim().max(3000).parse(value);
    case "boolean":
      return z.boolean().parse(value);
    case "number":
      return z.coerce.number().finite().parse(value);
    case "single_choice":
      return z.string().refine((v) => opts.includes(v), "Choose one of the options.").parse(value);
    case "multi_choice":
      return z.array(z.string().refine((v) => opts.includes(v), "Choose from the options.")).max(opts.length).parse(value);
  }
}

/**
 * Validates and persists a full response for one invitation in a single
 * transaction. The guest's current answers are replaced; history is kept in
 * response_submissions. Throws 409 when `expectedVersion` is stale.
 */
export async function submitResponse(
  db: DbExecutor,
  params: { invitationId: string; actor: Actor; payload: unknown; mode?: "submit" | "withdraw" },
): Promise<SubmitResult> {
  const mode = params.mode ?? "submit";
  const isHost = params.actor.kind === "user";

  const result = await db.transaction(async (tx) => {
    // Lock the invitation so concurrent submissions serialize on the version check.
    const [inv] = await tx.select().from(invitations).where(eq(invitations.id, params.invitationId)).for("update");
    if (!inv || inv.status === "revoked") throw new AppError("not_found", "This invitation link is no longer valid.");
    const [event] = await tx.select().from(events).where(eq(events.id, inv.eventId));
    if (!event || event.archivedAt) throw new AppError("not_found", "This invitation link is no longer valid.");
    const settings = parseSettings(event.settings);

    const payload =
      mode === "withdraw"
        ? responsePayloadSchema.parse({
            expectedVersion: (params.payload as { expectedVersion?: number })?.expectedVersion,
            people: [],
            attendance: [],
          })
        : responsePayloadSchema.parse(params.payload);

    if (payload.expectedVersion !== inv.responseVersion) {
      throw conflict("This response was changed somewhere else. Reload to see the latest version.", {
        currentVersion: inv.responseVersion,
      });
    }

    const lock = editLock(event, settings, inv);
    if (!isHost && lock.lockedReason === "deadline") {
      throw new AppError("rsvp_closed", "The RSVP deadline has passed. Please contact the host to make changes.");
    }
    if (!isHost && lock.lockedReason === "edits_disabled") {
      throw new AppError("rsvp_closed", "Responses can't be edited for this event. Please contact the host.");
    }
    const isLate = !isHost && lock.isLate;

    // ---- People in scope -------------------------------------------------
    const existing = await scopePeople(tx, inv);
    const existingById = new Map(existing.map((p) => [p.id, p]));
    const keyToGuestId = new Map<string, string>(existing.map((p) => [p.id, p.id]));
    const changes: ChangeEntry[] = [];

    const newPlusOnes = payload.people.filter((p) => p.key.startsWith("new:"));
    const keptPlusOneIds = new Set(payload.people.filter((p) => existingById.get(p.key)?.plusOneOfInvitationId).map((p) => p.key));
    for (const p of payload.people) {
      if (!p.key.startsWith("new:") && !existingById.has(p.key)) throw invalid("Someone in this response isn't part of this invitation.");
    }
    const removedPlusOnes =
      mode === "withdraw" ? [] : existing.filter((p) => p.plusOneOfInvitationId && !keptPlusOneIds.has(p.id));
    const plusOneTotal = keptPlusOneIds.size + newPlusOnes.length;
    if (mode === "submit" && plusOneTotal > inv.plusOnesAllowed) {
      throw invalid(
        inv.plusOnesAllowed === 0
          ? "This invitation doesn't include additional guests."
          : `This invitation allows up to ${inv.plusOnesAllowed} additional guest(s).`,
      );
    }
    for (const p of newPlusOnes) {
      if (!p.name) throw invalid("Enter a name for each additional guest.");
      const [g] = await tx
        .insert(guests)
        .values({ eventId: inv.eventId, name: p.name, plusOneOfInvitationId: inv.id })
        .returning({ id: guests.id });
      keyToGuestId.set(p.key, g.id);
      changes.push({ type: "plus_one", guest: p.name, change: "added" });
    }
    if (removedPlusOnes.length) {
      await tx.delete(guests).where(inArray(guests.id, removedPlusOnes.map((p) => p.id)));
      for (const p of removedPlusOnes) {
        keyToGuestId.delete(p.id);
        changes.push({ type: "plus_one", guest: p.name, change: "removed" });
      }
    }
    const resolve = (key: string) => {
      const id = keyToGuestId.get(key);
      if (!id) throw invalid("Someone in this response isn't part of this invitation.");
      return id;
    };
    const scopeIds = [...new Set(keyToGuestId.values())];
    const nameOf = (id: string) => existingById.get(id)?.name ?? newPlusOnes.find((p) => keyToGuestId.get(p.key) === id)?.name ?? "Guest";

    // ---- Guest details ---------------------------------------------------
    const allowedDietary = new Set(settings.dietaryOptions);
    for (const p of payload.people) {
      const guestId = resolve(p.key);
      const patch: Partial<typeof guests.$inferInsert> = {};
      if (settings.features.dietary) {
        const unknown = p.dietary.filter((d) => !allowedDietary.has(d));
        if (unknown.length) throw invalid(`Unknown dietary option: ${unknown.join(", ")}.`);
        patch.dietary = [...new Set(p.dietary)];
        patch.dietaryNotes = p.dietaryNotes;
      }
      if (settings.features.accessibility) patch.accessibilityNeeds = p.accessibilityNeeds;
      const current = existingById.get(guestId);
      if (current?.plusOneOfInvitationId && p.name && p.name !== current.name) patch.name = p.name;
      if (Object.keys(patch).length) await tx.update(guests).set(patch).where(eq(guests.id, guestId));
    }

    // ---- Attendance ------------------------------------------------------
    const permitted = await tx
      .select({ a: activities })
      .from(activities)
      .innerJoin(
        invitationActivityPermissions,
        and(eq(invitationActivityPermissions.activityId, activities.id), eq(invitationActivityPermissions.invitationId, inv.id)),
      );
    const askable = new Map(permitted.filter((r) => r.a.attendanceRequested).map((r) => [r.a.id, r.a]));
    const before = scopeIds.length
      ? await tx.select().from(activityAttendance).where(inArray(activityAttendance.guestId, scopeIds))
      : [];
    const beforeMap = new Map(before.map((r) => [`${r.guestId}|${r.activityId}`, r.status]));

    const desired = new Map<string, { guestId: string; activityId: string; status: Status }>();
    for (const item of payload.attendance) {
      const activity = askable.get(item.activityId);
      if (!activity) throw invalid("This invitation doesn't include one of the selected activities.");
      if (item.status === "maybe" && !settings.allowMaybe) throw invalid("Please choose attending or not attending.");
      const guestId = resolve(item.personKey);
      const k = `${guestId}|${item.activityId}`;
      if (desired.has(k)) throw invalid("Each person can only have one answer per activity.");
      desired.set(k, { guestId, activityId: item.activityId, status: item.status });
    }
    for (const activity of askable.values()) {
      if (activity.allowDecline) continue;
      const statuses = new Set(
        [...desired.values()].filter((d) => d.activityId === activity.id).map((d) => d.status),
      );
      if (statuses.size > 1) throw invalid(`Everyone in your party should give the same answer for ${activity.name}.`);
    }

    // Capacity: lock limited activities and check seats taken by other parties.
    for (const activity of askable.values()) {
      if (activity.capacity == null) continue;
      const wanting = [...desired.values()].filter((d) => d.activityId === activity.id && d.status === "attending").length;
      const already = before.filter((b) => b.activityId === activity.id && b.status === "attending").length;
      if (wanting <= already) continue;
      await tx.select({ id: activities.id }).from(activities).where(eq(activities.id, activity.id)).for("update");
      const [{ taken }] = await tx
        .select({ taken: sql<number>`count(*)::int` })
        .from(activityAttendance)
        .where(
          and(
            eq(activityAttendance.activityId, activity.id),
            eq(activityAttendance.status, "attending"),
            scopeIds.length ? notInArray(activityAttendance.guestId, scopeIds) : sql`true`,
          ),
        );
      if (taken + wanting > activity.capacity) {
        const left = Math.max(0, activity.capacity - taken);
        throw conflict(
          left === 0 ? `${activity.name} is full.` : `${activity.name} only has ${left} place(s) left.`,
          { activityId: activity.id },
        );
      }
    }

    // Insert the submission first so attendance rows can reference it.
    const version = inv.responseVersion + 1;
    const kind = mode === "withdraw" ? "withdrawn" : isHost ? "host_edit" : inv.responseStatus === "pending" ? "submitted" : "updated";
    const [submission] = await tx
      .insert(responseSubmissions)
      .values({
        eventId: inv.eventId,
        invitationId: inv.id,
        version,
        kind,
        submittedByUserId: isHost ? (params.actor as { userId: string }).userId : null,
        isLate,
        snapshot: {},
      })
      .returning({ id: responseSubmissions.id });

    const askableIds = [...askable.keys()];
    if (scopeIds.length && askableIds.length) {
      await tx
        .delete(activityAttendance)
        .where(and(inArray(activityAttendance.guestId, scopeIds), inArray(activityAttendance.activityId, askableIds)));
    }
    if (desired.size) {
      await tx.insert(activityAttendance).values(
        [...desired.values()].map((d) => ({
          eventId: inv.eventId,
          activityId: d.activityId,
          guestId: d.guestId,
          status: d.status,
          responseSubmissionId: submission.id,
        })),
      );
    }
    for (const activityId of askableIds) {
      for (const guestId of scopeIds) {
        const from = beforeMap.get(`${guestId}|${activityId}`) ?? null;
        const to = desired.get(`${guestId}|${activityId}`)?.status ?? null;
        if (from !== to) changes.push({ type: "attendance", guest: nameOf(guestId), activity: askable.get(activityId)!.name, from, to });
      }
    }

    // ---- Accommodation -----------------------------------------------------
    if (settings.features.accommodation || mode === "withdraw") {
      const current = await tx
        .select()
        .from(accommodationRequests)
        .where(and(eq(accommodationRequests.invitationId, inv.id), eq(accommodationRequests.status, "requested")));
      const currentGuests = current.length
        ? await tx.select().from(accommodationRequestGuests).where(inArray(accommodationRequestGuests.requestId, current.map((c) => c.id)))
        : [];
      const windowStart = addDays(event.startDate, -7);
      const windowEnd = addDays(event.endDate, 7);
      const seen = new Set<string>();
      for (const item of payload.accommodation) {
        if (item.departureDate <= item.arrivalDate) throw invalid("Check-out must be after check-in.");
        if (item.arrivalDate < windowStart || item.departureDate > windowEnd) {
          throw invalid("Accommodation dates must be close to the event dates.");
        }
        const guestIds = [...new Set(item.personKeys.map(resolve))];
        const values = {
          arrivalDate: item.arrivalDate,
          departureDate: item.departureDate,
          roomCountRequested: item.roomCount ?? null,
          roomSharingPreference: item.roomSharing,
          notes: item.notes,
        };
        const prev = item.id ? current.find((c) => c.id === item.id) : undefined;
        if (item.id && !prev) throw invalid("Unknown accommodation request.");
        let requestId: string;
        if (prev) {
          seen.add(prev.id);
          requestId = prev.id;
          const prevGuests = currentGuests.filter((g) => g.requestId === prev.id).map((g) => g.guestId).sort();
          const changed =
            prev.arrivalDate !== values.arrivalDate ||
            prev.departureDate !== values.departureDate ||
            prev.roomCountRequested !== values.roomCountRequested ||
            prevGuests.join() !== [...guestIds].sort().join();
          const [assigned] = changed
            ? await tx
                .select({ id: accommodationAssignments.id })
                .from(accommodationAssignments)
                .where(and(eq(accommodationAssignments.requestId, prev.id), sql`${accommodationAssignments.status} <> 'cancelled'`))
                .limit(1)
            : [];
          await tx
            .update(accommodationRequests)
            .set({ ...values, changedAfterAssignment: prev.changedAfterAssignment || !!assigned })
            .where(eq(accommodationRequests.id, prev.id));
          if (changed) changes.push({ type: "logistics", area: "accommodation", summary: `Stay changed to ${values.arrivalDate} → ${values.departureDate}` });
          await tx.delete(accommodationRequestGuests).where(eq(accommodationRequestGuests.requestId, prev.id));
        } else {
          const [row] = await tx
            .insert(accommodationRequests)
            .values({ eventId: inv.eventId, invitationId: inv.id, ...values })
            .returning({ id: accommodationRequests.id });
          requestId = row.id;
          changes.push({ type: "logistics", area: "accommodation", summary: `Stay requested ${values.arrivalDate} → ${values.departureDate}` });
        }
        await tx.insert(accommodationRequestGuests).values(guestIds.map((guestId) => ({ requestId, guestId })));
      }
      const removed = current.filter((c) => !seen.has(c.id));
      if (removed.length) {
        await tx
          .update(accommodationRequests)
          .set({ status: "cancelled" })
          .where(inArray(accommodationRequests.id, removed.map((r) => r.id)));
        changes.push({ type: "logistics", area: "accommodation", summary: `${removed.length} stay request(s) cancelled` });
      }
    }

    // ---- Meals -----------------------------------------------------------
    if ((settings.features.meals || mode === "withdraw") && scopeIds.length) {
      await tx
        .delete(mealOverrides)
        .where(and(inArray(mealOverrides.guestId, scopeIds), eq(mealOverrides.setByHost, false)));
      if (payload.mealOptOuts.length) {
        const optable = new Set(
          (
            await tx
              .select({ id: mealDefinitions.id })
              .from(mealDefinitions)
              .where(and(eq(mealDefinitions.eventId, inv.eventId), eq(mealDefinitions.guestCanOptOut, true)))
          ).map((m) => m.id),
        );
        const rows = new Map<string, { guestId: string; mealId: string }>();
        for (const o of payload.mealOptOuts) {
          if (!optable.has(o.mealId)) throw invalid("That meal can't be skipped from the RSVP.");
          const guestId = resolve(o.personKey);
          rows.set(`${guestId}|${o.mealId}`, { guestId, mealId: o.mealId });
        }
        await tx
          .insert(mealOverrides)
          .values([...rows.values()].map((r) => ({ ...r, eventId: inv.eventId, override: "opted_out" as const })))
          .onConflictDoNothing();
      }
    }

    // ---- Transport -------------------------------------------------------
    if (settings.features.transport || mode === "withdraw") {
      const current = await tx
        .select()
        .from(transportRequests)
        .where(and(eq(transportRequests.invitationId, inv.id), sql`${transportRequests.status} <> 'cancelled'`));
      const seen = new Set<string>();
      for (const item of payload.transport) {
        if (item.travelDate < addDays(event.startDate, -7) || item.travelDate > addDays(event.endDate, 7)) {
          throw invalid("Travel dates must be close to the event dates.");
        }
        const guestIds = [...new Set(item.personKeys.map(resolve))];
        const values = {
          direction: item.direction,
          travelDate: item.travelDate,
          travelTime: item.travelTime ?? null,
          location: item.location,
          notes: item.notes,
        };
        const prev = item.id ? current.find((c) => c.id === item.id) : undefined;
        if (item.id && !prev) throw invalid("Unknown transport request.");
        let requestId: string;
        if (prev) {
          seen.add(prev.id);
          requestId = prev.id;
          const changed =
            prev.direction !== values.direction ||
            prev.travelDate !== values.travelDate ||
            (prev.travelTime?.slice(0, 5) ?? null) !== values.travelTime ||
            prev.location !== values.location;
          await tx
            .update(transportRequests)
            .set({ ...values, status: changed ? "requested" : prev.status })
            .where(eq(transportRequests.id, prev.id));
          if (changed) changes.push({ type: "logistics", area: "transport", summary: `Transport changed: ${values.direction} on ${values.travelDate}` });
          await tx.delete(transportRequestGuests).where(eq(transportRequestGuests.requestId, prev.id));
        } else {
          const [row] = await tx
            .insert(transportRequests)
            .values({ eventId: inv.eventId, invitationId: inv.id, ...values })
            .returning({ id: transportRequests.id });
          requestId = row.id;
          changes.push({ type: "logistics", area: "transport", summary: `Transport requested: ${values.direction} on ${values.travelDate}` });
        }
        await tx.insert(transportRequestGuests).values(guestIds.map((guestId) => ({ requestId, guestId })));
      }
      const removed = current.filter((c) => !seen.has(c.id));
      if (removed.length) {
        await tx
          .update(transportRequests)
          .set({ status: "cancelled" })
          .where(inArray(transportRequests.id, removed.map((r) => r.id)));
        changes.push({ type: "logistics", area: "transport", summary: `${removed.length} transport request(s) cancelled` });
      }
    }

    // ---- Custom questions ----------------------------------------------
    const questions = await tx.select().from(customQuestions).where(eq(customQuestions.eventId, inv.eventId));
    const attendingActivities = new Set([...desired.values()].filter((d) => d.status === "attending").map((d) => d.activityId));
    const provided = new Map(payload.answers.map((a) => [a.questionId, a.value]));
    for (const id of provided.keys()) if (!questions.some((q) => q.id === id)) throw invalid("Unknown question.");
    await tx.delete(customAnswers).where(eq(customAnswers.invitationId, inv.id));
    const answerRows: (typeof customAnswers.$inferInsert)[] = [];
    for (const q of questions) {
      // Activity-specific questions only apply when someone in the party attends it.
      if (q.activityId && !attendingActivities.has(q.activityId)) continue;
      let value: unknown;
      try {
        value = validateAnswer(q, provided.get(q.id));
      } catch {
        throw invalid(`Please check your answer to "${q.questionText}".`);
      }
      if (value === null) {
        if (q.isRequired && mode === "submit" && !isHost) throw invalid(`Please answer "${q.questionText}".`);
        continue;
      }
      answerRows.push({ questionId: q.id, invitationId: inv.id, responseSubmissionId: submission.id, answer: value });
    }
    if (answerRows.length) await tx.insert(customAnswers).values(answerRows);

    // ---- Finalise ----------------------------------------------------------
    const responseStatus: InvitationRow["responseStatus"] =
      mode === "withdraw" ? "withdrawn" : inv.responseStatus === "pending" ? "submitted" : "updated";
    await tx
      .update(invitations)
      .set({
        responseStatus,
        responseVersion: version,
        lastRespondedAt: new Date(),
        hasLateChanges: inv.hasLateChanges || isLate,
        respondentNotes: mode === "withdraw" ? inv.respondentNotes : payload.notes,
        status: inv.status === "draft" ? "sent" : inv.status,
      })
      .where(eq(invitations.id, inv.id));

    const snapshot = {
      people: scopeIds.map((id) => ({ id, name: nameOf(id) })),
      attendance: [...desired.values()],
      accommodation: payload.accommodation.map((a) => ({ ...a, guestIds: a.personKeys.map(resolve), personKeys: undefined })),
      transport: payload.transport.map((t) => ({ ...t, guestIds: t.personKeys.map(resolve), personKeys: undefined })),
      mealOptOuts: payload.mealOptOuts.map((m) => ({ mealId: m.mealId, guestId: resolve(m.personKey) })),
      answers: answerRows.map((a) => ({ questionId: a.questionId, answer: a.answer })),
      notes: payload.notes,
    };
    await tx.update(responseSubmissions).set({ snapshot, changes }).where(eq(responseSubmissions.id, submission.id));

    await audit(tx, params.actor, {
      eventId: inv.eventId,
      action: `response.${kind}`,
      entityType: "invitation",
      entityId: inv.id,
      after: { version, attendanceAnswers: desired.size, changes: changes.length, isLate },
    });

    await queueResponseNotifications(tx, { event, settings, inv, version, kind, isHost, label: await invitationLabel(tx, inv), changes });

    return { version, responseStatus, isLate, changes };
  });
  return result;
}

async function queueResponseNotifications(
  db: DbExecutor,
  ctx: {
    event: EventRow;
    settings: EventSettings;
    inv: InvitationRow;
    version: number;
    kind: string;
    isHost: boolean;
    label: string;
    changes: ChangeEntry[];
  },
) {
  const { event, settings, inv, version } = ctx;
  if (settings.notifyHostOnResponse && !ctx.isHost) {
    const hosts = await db
      .select({ email: users.email })
      .from(eventMembers)
      .innerJoin(users, eq(users.id, eventMembers.userId))
      .where(and(eq(eventMembers.eventId, event.id), inArray(eventMembers.role, ["owner", "organizer"])));
    for (const h of hosts) {
      await enqueueNotification(db, {
        eventId: event.id,
        idempotencyKey: `host-response:${inv.id}:v${version}:${h.email}`,
        recipient: h.email,
        templateKey: "host_response",
        payload: {
          eventId: event.id,
          eventName: event.name,
          label: ctx.label,
          kind: ctx.kind,
          changeCount: ctx.changes.length,
          late: inv.hasLateChanges,
        },
      });
    }
  }
  if (settings.sendGuestConfirmation) {
    const people = await scopePeople(db, inv);
    const primary =
      (inv.guestId && people.find((p) => p.id === inv.guestId)) ||
      people.find((p) => p.email && !p.plusOneOfInvitationId);
    if (primary?.email) {
      await enqueueNotification(db, {
        eventId: event.id,
        idempotencyKey: `guest-confirmation:${inv.id}:v${version}`,
        recipient: primary.email,
        templateKey: "guest_confirmation",
        // The link is regenerated at send time from the invitation id; tokens are never stored in jobs.
        payload: { eventName: event.name, invitationId: inv.id, kind: ctx.kind },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Host-side access to a single response
// ---------------------------------------------------------------------------

export async function getResponseForHost(db: DbExecutor, userId: string, invitationId: string) {
  const [inv] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
  if (!inv) throw notFound("Invitation");
  const { event, role } = await requireEventAccess(db, userId, inv.eventId, "view");
  const view = await getRsvpView(db, { invitation: inv, event });
  const history = await db
    .select({
      id: responseSubmissions.id,
      version: responseSubmissions.version,
      kind: responseSubmissions.kind,
      isLate: responseSubmissions.isLate,
      changes: responseSubmissions.changes,
      submittedAt: responseSubmissions.submittedAt,
      hostName: users.name,
    })
    .from(responseSubmissions)
    .leftJoin(users, eq(users.id, responseSubmissions.submittedByUserId))
    .where(eq(responseSubmissions.invitationId, invitationId))
    .orderBy(sql`${responseSubmissions.version} desc`);
  const contacts = await scopePeople(db, inv);
  return {
    view,
    role,
    invitation: inv,
    history: history.map((h) => ({ ...h, changes: h.changes as ChangeEntry[] })),
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
  };
}

export async function hostSubmitResponse(db: DbExecutor, userId: string, invitationId: string, payload: unknown) {
  const [inv] = await db.select({ eventId: invitations.eventId }).from(invitations).where(eq(invitations.id, invitationId));
  if (!inv) throw notFound("Invitation");
  await requireEventAccess(db, userId, inv.eventId, "manage");
  return submitResponse(db, { invitationId, actor: { kind: "user", userId }, payload });
}

export async function clearLateFlag(db: DbExecutor, userId: string, invitationId: string) {
  const [inv] = await db.select({ eventId: invitations.eventId }).from(invitations).where(eq(invitations.id, invitationId));
  if (!inv) throw notFound("Invitation");
  await requireEventAccess(db, userId, inv.eventId, "manage");
  await db.update(invitations).set({ hasLateChanges: false }).where(eq(invitations.id, invitationId));
  await audit(db, { kind: "user", userId }, { eventId: inv.eventId, action: "response.late_reviewed", entityType: "invitation", entityId: invitationId });
}
