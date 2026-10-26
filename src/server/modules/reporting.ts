import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accommodationTotals,
  availabilityForSlot,
  computeMealCount,
  expectedAttendance,
  nightsInStay,
  rankSlots,
  summarizeAttendance,
  type AttendanceStatus,
} from "@/domain/calculations";
import { parseSettings } from "@/domain/settings";
import { utcToZoned } from "@/lib/dates";
import { queryRows, type DbExecutor } from "../db/connect";
import {
  accommodationAssignments,
  accommodationRequestGuests,
  accommodationRequests,
  activityAttendance,
  guests,
  households,
  invitations,
  mealActivityLinks,
  mealDefinitions,
  mealOverrides,
  responseSubmissions,
  transportRequestGuests,
  transportRequests,
} from "../db/schema";
import { requireEventAccess } from "./access";
import { listActivities } from "./events";
import { invitationScopeSql } from "./invitations";
import type { ChangeEntry } from "./rsvp";

interface ScopeRow {
  invitation_id: string;
  guest_id: string;
}

/** Shared base data for an event's reports, loaded with a handful of set-based queries. */
async function loadBase(db: DbExecutor, eventId: string) {
  const scope = await queryRows<ScopeRow>(db, sql`select invitation_id, guest_id from ${invitationScopeSql(eventId)} s`);
  const perms = await queryRows<{ invitation_id: string; activity_id: string }>(
    db,
    sql`select p.invitation_id, p.activity_id from invitation_activity_permissions p
          join invitations i on i.id = p.invitation_id
         where i.event_id = ${eventId} and i.status <> 'revoked'`,
  );
  const attendanceRows = await db
    .select({ guestId: activityAttendance.guestId, activityId: activityAttendance.activityId, status: activityAttendance.status })
    .from(activityAttendance)
    .where(eq(activityAttendance.eventId, eventId));

  const guestsByInvitation = new Map<string, string[]>();
  const invitationByGuest = new Map<string, string>();
  for (const r of scope) {
    guestsByInvitation.set(r.invitation_id, [...(guestsByInvitation.get(r.invitation_id) ?? []), r.guest_id]);
    invitationByGuest.set(r.guest_id, r.invitation_id);
  }
  // activityId -> eligible guest ids
  const eligible = new Map<string, Set<string>>();
  for (const p of perms) {
    const set = eligible.get(p.activity_id) ?? new Set<string>();
    for (const g of guestsByInvitation.get(p.invitation_id) ?? []) set.add(g);
    eligible.set(p.activity_id, set);
  }
  // activityId -> guestId -> status, restricted to eligible guests
  const attendance = new Map<string, Map<string, AttendanceStatus>>();
  for (const a of attendanceRows) {
    if (!eligible.get(a.activityId)?.has(a.guestId)) continue;
    const m = attendance.get(a.activityId) ?? new Map<string, AttendanceStatus>();
    m.set(a.guestId, a.status);
    attendance.set(a.activityId, m);
  }
  return { scope, invitationByGuest, guestsByInvitation, eligible, attendance };
}

export async function getEventSummary(db: DbExecutor, userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(db, userId, eventId, "view");
  const settings = parseSettings(event.settings);
  const [base, acts, invRows, guestTotals] = await Promise.all([
    loadBase(db, eventId),
    listActivities(db, eventId),
    db
      .select({ id: invitations.id, status: invitations.status, responseStatus: invitations.responseStatus, hasLateChanges: invitations.hasLateChanges })
      .from(invitations)
      .where(eq(invitations.eventId, eventId)),
    db
      .select({ total: sql<number>`count(*)::int`, plusOnes: sql<number>`count(${guests.plusOneOfInvitationId})::int` })
      .from(guests)
      .where(eq(guests.eventId, eventId)),
  ]);

  const active = invRows.filter((i) => i.status !== "revoked");
  const respondedInvitations = new Set(active.filter((i) => i.responseStatus === "submitted" || i.responseStatus === "updated").map((i) => i.id));
  const invitedPeople = new Set(base.scope.map((s) => s.guest_id));
  const respondedPeople = base.scope.filter((s) => respondedInvitations.has(s.invitation_id)).length;

  const activityStats = acts
    .filter((a) => a.attendanceRequested)
    .map((a) => {
      const counts = summarizeAttendance(base.eligible.get(a.id) ?? [], base.attendance.get(a.id) ?? new Map());
      const local = utcToZoned(a.startAt, event.timezone);
      return {
        id: a.id,
        name: a.name,
        date: local.date,
        time: local.time,
        startAt: a.startAt.toISOString(),
        capacity: a.capacity,
        ...counts,
        expected: expectedAttendance(counts, settings.tentativeWeight),
      };
    });

  const slots = settings.availabilityMode
    ? rankSlots(activityStats.map((s) => availabilityForSlot(s.id, s, settings.minParticipants)))
    : [];

  const recent = await db
    .select({
      id: responseSubmissions.id,
      invitationId: responseSubmissions.invitationId,
      kind: responseSubmissions.kind,
      isLate: responseSubmissions.isLate,
      changes: responseSubmissions.changes,
      submittedAt: responseSubmissions.submittedAt,
      label: sql<string>`coalesce(${households.name}, ${guests.name}, 'Invitation')`,
    })
    .from(responseSubmissions)
    .innerJoin(invitations, eq(invitations.id, responseSubmissions.invitationId))
    .leftJoin(households, eq(households.id, invitations.householdId))
    .leftJoin(guests, eq(guests.id, invitations.guestId))
    .where(eq(responseSubmissions.eventId, eventId))
    .orderBy(desc(responseSubmissions.submittedAt))
    .limit(12);

  return {
    event,
    role,
    settings,
    totals: {
      guests: guestTotals[0].total,
      plusOnes: guestTotals[0].plusOnes,
      invitedPeople: invitedPeople.size,
      notInvited: guestTotals[0].total - invitedPeople.size,
      respondedPeople,
      pendingPeople: invitedPeople.size - respondedPeople,
      invitations: active.length,
      invitationsResponded: respondedInvitations.size,
      invitationsPending: active.filter((i) => i.responseStatus === "pending").length,
      invitationsWithdrawn: active.filter((i) => i.responseStatus === "withdrawn").length,
      invitationsSent: active.filter((i) => i.status !== "draft").length,
      lateChanges: active.filter((i) => i.hasLateChanges).length,
    },
    activities: activityStats,
    slots,
    recent: recent.map((r) => ({ ...r, changes: r.changes as ChangeEntry[] })),
    lastUpdated: recent[0]?.submittedAt ?? null,
    checklist: {
      activities: acts.length > 0,
      guests: guestTotals[0].total > 0,
      invitations: active.length > 0,
      shared: active.some((i) => i.status !== "draft"),
      responses: respondedInvitations.size > 0,
    },
  };
}

export type EventSummary = Awaited<ReturnType<typeof getEventSummary>>;

// ---------------------------------------------------------------------------
// Attendee drill-down
// ---------------------------------------------------------------------------

export interface DrilldownFilter {
  activityId?: string;
  status?: AttendanceStatus | "unanswered";
  groupId?: string;
  response?: "pending" | "submitted" | "updated" | "withdrawn";
  q?: string;
}

export async function getAttendeeList(db: DbExecutor, userId: string, eventId: string, filter: DrilldownFilter) {
  const { event } = await requireEventAccess(db, userId, eventId, "view");
  const base = await loadBase(db, eventId);
  const acts = (await listActivities(db, eventId)).filter((a) => a.attendanceRequested);

  const people = await db
    .select({
      id: guests.id,
      name: guests.name,
      plusOne: sql<boolean>`${guests.plusOneOfInvitationId} is not null`,
      dietary: guests.dietary,
      groupIds: sql<string[]>`coalesce((select array_agg(m.guest_group_id::text) from guest_group_memberships m where m.guest_id = ${guests.id}), '{}')`,
    })
    .from(guests)
    .where(eq(guests.eventId, eventId))
    .orderBy(asc(guests.name));
  const invRows = await db
    .select({
      id: invitations.id,
      responseStatus: invitations.responseStatus,
      hasLateChanges: invitations.hasLateChanges,
      lastRespondedAt: invitations.lastRespondedAt,
      label: sql<string>`coalesce(${households.name}, ${guests.name}, 'Invitation')`,
    })
    .from(invitations)
    .leftJoin(households, eq(households.id, invitations.householdId))
    .leftJoin(guests, eq(guests.id, invitations.guestId))
    .where(and(eq(invitations.eventId, eventId), sql`${invitations.status} <> 'revoked'`));
  const invById = new Map(invRows.map((i) => [i.id, i]));

  const term = filter.q?.trim().toLowerCase();
  const rows = people
    .filter((p) => base.invitationByGuest.has(p.id))
    .map((p) => {
      const inv = invById.get(base.invitationByGuest.get(p.id)!)!;
      const statuses: Record<string, AttendanceStatus | "unanswered" | "not_invited"> = {};
      for (const a of acts) {
        statuses[a.id] = base.eligible.get(a.id)?.has(p.id)
          ? (base.attendance.get(a.id)?.get(p.id) ?? "unanswered")
          : "not_invited";
      }
      return { ...p, invitation: inv, statuses };
    })
    .filter((r) => {
      if (term && !r.name.toLowerCase().includes(term) && !r.invitation.label.toLowerCase().includes(term)) return false;
      if (filter.groupId && !r.groupIds.includes(filter.groupId)) return false;
      if (filter.response && r.invitation.responseStatus !== filter.response) return false;
      if (filter.activityId) {
        const s = r.statuses[filter.activityId];
        if (s === "not_invited" || s === undefined) return false;
        if (filter.status && s !== filter.status) return false;
      } else if (filter.status && !Object.values(r.statuses).includes(filter.status)) {
        return false;
      }
      return true;
    });

  return {
    timezone: event.timezone,
    activities: acts.map((a) => ({ id: a.id, name: a.name, startAt: a.startAt.toISOString() })),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

export async function getAccommodationReport(db: DbExecutor, userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(db, userId, eventId, "view");
  const requests = await db
    .select({
      r: accommodationRequests,
      label: sql<string>`coalesce(${households.name}, ${guests.name}, 'Invitation')`,
      invitationStatus: invitations.status,
    })
    .from(accommodationRequests)
    .innerJoin(invitations, eq(invitations.id, accommodationRequests.invitationId))
    .leftJoin(households, eq(households.id, invitations.householdId))
    .leftJoin(guests, eq(guests.id, invitations.guestId))
    .where(eq(accommodationRequests.eventId, eventId))
    .orderBy(asc(accommodationRequests.arrivalDate));
  const ids = requests.map((r) => r.r.id);
  const reqGuests = ids.length
    ? await db
        .select({ requestId: accommodationRequestGuests.requestId, guestId: guests.id, name: guests.name, accessibilityNeeds: guests.accessibilityNeeds })
        .from(accommodationRequestGuests)
        .innerJoin(guests, eq(guests.id, accommodationRequestGuests.guestId))
        .where(inArray(accommodationRequestGuests.requestId, ids))
    : [];
  const assignments = await db.select().from(accommodationAssignments).where(eq(accommodationAssignments.eventId, eventId));

  const items = requests.map(({ r, label, invitationStatus }) => {
    const people = reqGuests.filter((g) => g.requestId === r.id);
    const asg = assignments.filter((a) => a.requestId === r.id && a.status !== "cancelled");
    const nights = nightsInStay(r.arrivalDate, r.departureDate);
    const issues: string[] = [];
    const isActive = r.status === "requested" && invitationStatus !== "revoked";
    if (isActive) {
      if (r.roomCountRequested == null) issues.push("Room count not specified");
      if (!asg.length) issues.push("Awaiting room assignment");
      if (r.changedAfterAssignment) issues.push("Changed after a room was assigned");
      for (const a of asg) {
        if (a.checkInDate > r.arrivalDate || a.checkOutDate < r.departureDate) issues.push(`${a.propertyName}: assignment doesn't cover the requested dates`);
      }
    } else if (asg.length) {
      issues.push("Request cancelled but a room is still assigned");
    }
    return {
      ...r,
      label,
      active: isActive,
      nights,
      guestNights: nights * people.length,
      roomNights: r.roomCountRequested == null ? null : nights * r.roomCountRequested,
      people,
      assignments: asg,
      issues,
    };
  });
  const totals = accommodationTotals(
    items
      .filter((i) => i.active)
      .map((i) => ({
        id: i.id,
        arrivalDate: i.arrivalDate,
        departureDate: i.departureDate,
        guestIds: i.people.map((p) => p.guestId),
        roomCount: i.roomCountRequested,
      })),
  );
  const confirmedAssignments = assignments.filter((a) => a.status === "confirmed");
  return {
    event,
    role,
    items,
    totals,
    assignedRoomNights: confirmedAssignments.reduce((sum, a) => sum + nightsInStay(a.checkInDate, a.checkOutDate), 0),
    awaiting: items.filter((i) => i.active && i.assignments.length === 0).length,
    issues: items.filter((i) => i.issues.length > 0 && (i.active || i.assignments.length)).length,
  };
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export async function getMealReport(db: DbExecutor, userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(db, userId, eventId, "view");
  const base = await loadBase(db, eventId);
  const meals = await db
    .select()
    .from(mealDefinitions)
    .where(eq(mealDefinitions.eventId, eventId))
    .orderBy(asc(mealDefinitions.serviceDate), asc(mealDefinitions.serviceTime), asc(mealDefinitions.sortOrder));
  const links = meals.length
    ? await db.select().from(mealActivityLinks).where(inArray(mealActivityLinks.mealId, meals.map((m) => m.id)))
    : [];
  const overrides = await db.select().from(mealOverrides).where(eq(mealOverrides.eventId, eventId));
  const stays = await db
    .select({ guestId: accommodationRequestGuests.guestId, arrivalDate: accommodationRequests.arrivalDate, departureDate: accommodationRequests.departureDate })
    .from(accommodationRequests)
    .innerJoin(accommodationRequestGuests, eq(accommodationRequestGuests.requestId, accommodationRequests.id))
    .where(and(eq(accommodationRequests.eventId, eventId), eq(accommodationRequests.status, "requested")));
  const people = await db
    .select({ id: guests.id, name: guests.name, dietary: guests.dietary, dietaryNotes: guests.dietaryNotes })
    .from(guests)
    .where(eq(guests.eventId, eventId));

  const invited = new Set(base.invitationByGuest.keys());
  const staysByGuest = new Map<string, { arrivalDate: string; departureDate: string }[]>();
  for (const s of stays) {
    if (!invited.has(s.guestId)) continue;
    staysByGuest.set(s.guestId, [...(staysByGuest.get(s.guestId) ?? []), s]);
  }
  const overrideMap = new Map<string, Map<string, "opted_in" | "opted_out">>();
  for (const o of overrides) {
    if (!invited.has(o.guestId)) continue;
    const m = overrideMap.get(o.mealId) ?? new Map();
    m.set(o.guestId, o.override);
    overrideMap.set(o.mealId, m);
  }
  const dietaryByGuest = new Map(people.map((p) => [p.id, p.dietary]));
  const nameById = new Map(people.map((p) => [p.id, p]));

  const rows = meals.map((m) => {
    const activityIds = links.filter((l) => l.mealId === m.id).map((l) => l.activityId);
    const count = computeMealCount(
      { id: m.id, serviceDate: m.serviceDate, basis: m.basis, activityIds },
      { attendance: base.attendance, staysByGuest, overrides: overrideMap, dietaryByGuest },
    );
    return {
      ...m,
      serviceTime: m.serviceTime?.slice(0, 5) ?? null,
      activityIds,
      ...count,
      specialRequests: count.confirmedGuestIds
        .map((id) => nameById.get(id)!)
        .filter((p) => p?.dietaryNotes)
        .map((p) => ({ name: p.name, notes: p.dietaryNotes! })),
      optedOut: [...(overrideMap.get(m.id) ?? [])].filter(([, o]) => o === "opted_out").length,
    };
  });
  return { event, role, settings: parseSettings(event.settings), meals: rows, activities: await listActivities(db, eventId) };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export async function getTransportReport(db: DbExecutor, userId: string, eventId: string) {
  const { event, role } = await requireEventAccess(db, userId, eventId, "view");
  const rows = await db
    .select({ r: transportRequests, label: sql<string>`coalesce(${households.name}, ${guests.name}, 'Invitation')` })
    .from(transportRequests)
    .innerJoin(invitations, eq(invitations.id, transportRequests.invitationId))
    .leftJoin(households, eq(households.id, invitations.householdId))
    .leftJoin(guests, eq(guests.id, invitations.guestId))
    .where(and(eq(transportRequests.eventId, eventId), sql`${invitations.status} <> 'revoked'`))
    .orderBy(asc(transportRequests.travelDate), asc(transportRequests.travelTime));
  const ids = rows.map((r) => r.r.id);
  const passengers = ids.length
    ? await db
        .select({ requestId: transportRequestGuests.requestId, guestId: guests.id, name: guests.name })
        .from(transportRequestGuests)
        .innerJoin(guests, eq(guests.id, transportRequestGuests.guestId))
        .where(inArray(transportRequestGuests.requestId, ids))
    : [];
  const items = rows.map(({ r, label }) => {
    const p = passengers.filter((x) => x.requestId === r.id);
    return { ...r, travelTime: r.travelTime?.slice(0, 5) ?? null, label, passengers: p, passengerCount: p.length };
  });
  const active = items.filter((i) => i.status !== "cancelled");
  const byDate = new Map<string, { date: string; arrival: number; departure: number; local: number }>();
  for (const i of active) {
    const d = byDate.get(i.travelDate) ?? { date: i.travelDate, arrival: 0, departure: 0, local: 0 };
    d[i.direction] += i.passengerCount;
    byDate.set(i.travelDate, d);
  }
  return {
    event,
    role,
    items,
    byDate: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totals: {
      requests: active.length,
      passengers: new Set(active.flatMap((i) => i.passengers.map((p) => p.guestId))).size,
      unassigned: active.filter((i) => i.status === "requested").length,
    },
  };
}
