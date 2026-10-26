// Pure planning calculations. Every dashboard number is derived from these so
// the logic can be tested independently of the database.

import { addDays, daysBetween, eachDate } from "@/lib/dates";

export type AttendanceStatus = "attending" | "not_attending" | "maybe";

export interface AttendanceCounts {
  invited: number;
  confirmed: number;
  tentative: number;
  declined: number;
  unanswered: number;
}

/**
 * Counts for one activity. Only eligible guests count; selections by guests who
 * are no longer eligible (e.g. a revoked invitation) are ignored. Each guest is
 * counted exactly once and a missing selection is "unanswered", never "declined".
 */
export function summarizeAttendance(
  eligibleGuestIds: Iterable<string>,
  selections: ReadonlyMap<string, AttendanceStatus>,
): AttendanceCounts {
  const eligible = new Set(eligibleGuestIds);
  const counts: AttendanceCounts = { invited: eligible.size, confirmed: 0, tentative: 0, declined: 0, unanswered: 0 };
  for (const guestId of eligible) {
    const status = selections.get(guestId);
    if (status === "attending") counts.confirmed++;
    else if (status === "maybe") counts.tentative++;
    else if (status === "not_attending") counts.declined++;
    else counts.unanswered++;
  }
  return counts;
}

/** Forecast only: confirmed + tentative × weight. Unanswered guests are never weighted. */
export function expectedAttendance(counts: Pick<AttendanceCounts, "confirmed" | "tentative">, tentativeWeight: number): number {
  const w = Math.min(1, Math.max(0, tentativeWeight));
  return Math.round((counts.confirmed + counts.tentative * w) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Accommodation
// ---------------------------------------------------------------------------

/** Nights in a half-open stay: arrival inclusive, departure exclusive. */
export function nightsInStay(arrivalDate: string, departureDate: string): number {
  const n = daysBetween(arrivalDate, departureDate);
  if (n <= 0) throw new RangeError("Departure must be after arrival.");
  return n;
}

export interface StayRequest {
  id: string;
  arrivalDate: string;
  departureDate: string;
  guestIds: string[];
  roomCount: number | null;
}

export interface AccommodationTotals {
  /** Distinct (guest, night) pairs, so overlapping requests never double count. */
  guestNights: number;
  /** Rooms × nights for requests that specified a room count. */
  roomNights: number;
  requestsWithoutRoomCount: number;
  distinctGuests: number;
  nights: { date: string; guests: number; rooms: number; roomsUnknown: boolean }[];
  arrivals: Record<string, number>;
  departures: Record<string, number>;
}

export function accommodationTotals(requests: StayRequest[]): AccommodationTotals {
  const guestNightPairs = new Set<string>();
  const perNightGuests = new Map<string, Set<string>>();
  const perNightRooms = new Map<string, { rooms: number; unknown: boolean }>();
  const arrivals: Record<string, number> = {};
  const departures: Record<string, number> = {};
  const guests = new Set<string>();
  let roomNights = 0;
  let requestsWithoutRoomCount = 0;

  for (const r of requests) {
    const nights = eachDate(r.arrivalDate, r.departureDate);
    if (nights.length === 0) continue;
    if (r.roomCount == null) requestsWithoutRoomCount++;
    else roomNights += r.roomCount * nights.length;
    arrivals[r.arrivalDate] = (arrivals[r.arrivalDate] ?? 0) + r.guestIds.length;
    departures[r.departureDate] = (departures[r.departureDate] ?? 0) + r.guestIds.length;
    for (const night of nights) {
      const set = perNightGuests.get(night) ?? new Set<string>();
      for (const g of r.guestIds) {
        set.add(g);
        guestNightPairs.add(`${g}|${night}`);
        guests.add(g);
      }
      perNightGuests.set(night, set);
      const rooms = perNightRooms.get(night) ?? { rooms: 0, unknown: false };
      if (r.roomCount == null) rooms.unknown = true;
      else rooms.rooms += r.roomCount;
      perNightRooms.set(night, rooms);
    }
  }

  const nights = [...perNightGuests.keys()].sort().map((date) => ({
    date,
    guests: perNightGuests.get(date)!.size,
    rooms: perNightRooms.get(date)!.rooms,
    roomsUnknown: perNightRooms.get(date)!.unknown,
  }));

  return {
    guestNights: guestNightPairs.size,
    roomNights,
    requestsWithoutRoomCount,
    distinctGuests: guests.size,
    nights,
    arrivals,
    departures,
  };
}

/** True when a stay includes the night before `serviceDate` (i.e. the guest wakes up there). */
export function staysNightBefore(stay: { arrivalDate: string; departureDate: string }, serviceDate: string): boolean {
  const night = addDays(serviceDate, -1);
  return stay.arrivalDate <= night && night < stay.departureDate;
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export interface MealRule {
  id: string;
  serviceDate: string;
  basis: "activity" | "overnight" | "manual";
  activityIds: string[];
}

export interface MealInputs {
  /** activityId -> guestId -> status, restricted to eligible guests. */
  attendance: ReadonlyMap<string, ReadonlyMap<string, AttendanceStatus>>;
  /** Active (not cancelled) stays, per guest. */
  staysByGuest: ReadonlyMap<string, { arrivalDate: string; departureDate: string }[]>;
  /** mealId -> guestId -> override. */
  overrides: ReadonlyMap<string, ReadonlyMap<string, "opted_in" | "opted_out">>;
  dietaryByGuest: ReadonlyMap<string, string[]>;
}

export interface MealCount {
  mealId: string;
  confirmedGuestIds: string[];
  tentativeGuestIds: string[];
  confirmed: number;
  tentative: number;
  /** Restrictions are not mutually exclusive, so these can sum past `confirmed`. */
  dietary: Record<string, number>;
  noRestrictions: number;
}

export function computeMealCount(meal: MealRule, inputs: MealInputs): MealCount {
  const confirmed = new Set<string>();
  const tentative = new Set<string>();

  if (meal.basis === "activity") {
    for (const activityId of meal.activityIds) {
      for (const [guestId, status] of inputs.attendance.get(activityId) ?? []) {
        if (status === "attending") confirmed.add(guestId);
        else if (status === "maybe") tentative.add(guestId);
      }
    }
  } else if (meal.basis === "overnight") {
    for (const [guestId, stays] of inputs.staysByGuest) {
      if (stays.some((s) => staysNightBefore(s, meal.serviceDate))) confirmed.add(guestId);
    }
  }

  for (const [guestId, override] of inputs.overrides.get(meal.id) ?? []) {
    if (override === "opted_in") confirmed.add(guestId);
    else {
      confirmed.delete(guestId);
      tentative.delete(guestId);
    }
  }
  for (const g of confirmed) tentative.delete(g);

  const dietary: Record<string, number> = {};
  let noRestrictions = 0;
  for (const g of confirmed) {
    const tags = [...new Set(inputs.dietaryByGuest.get(g) ?? [])];
    if (tags.length === 0) noRestrictions++;
    for (const t of tags) dietary[t] = (dietary[t] ?? 0) + 1;
  }

  return {
    mealId: meal.id,
    confirmedGuestIds: [...confirmed],
    tentativeGuestIds: [...tentative],
    confirmed: confirmed.size,
    tentative: tentative.size,
    dietary,
    noRestrictions,
  };
}

// ---------------------------------------------------------------------------
// Availability (date polls, sports slots)
// ---------------------------------------------------------------------------

export interface SlotAvailability {
  activityId: string;
  available: number;
  ifNeeded: number;
  unavailable: number;
  unanswered: number;
  invited: number;
  /** Share of invited participants who are available, 0..1. */
  availableShare: number;
  meetsMinimum: boolean | null;
}

export function availabilityForSlot(
  activityId: string,
  counts: AttendanceCounts,
  minParticipants: number | null,
): SlotAvailability {
  return {
    activityId,
    available: counts.confirmed,
    ifNeeded: counts.tentative,
    unavailable: counts.declined,
    unanswered: counts.unanswered,
    invited: counts.invited,
    availableShare: counts.invited === 0 ? 0 : counts.confirmed / counts.invited,
    meetsMinimum: minParticipants == null ? null : counts.confirmed >= minParticipants,
  };
}

/** Slots ordered best-first (available, then if-needed). Ranking only; never auto-selects. */
export function rankSlots(slots: SlotAvailability[]): SlotAvailability[] {
  return [...slots].sort((a, b) => b.available - a.available || b.ifNeeded - a.ifNeeded);
}
