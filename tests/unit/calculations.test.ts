import { describe, expect, it } from "vitest";
import {
  accommodationTotals,
  availabilityForSlot,
  computeMealCount,
  expectedAttendance,
  nightsInStay,
  rankSlots,
  staysNightBefore,
  summarizeAttendance,
  type AttendanceStatus,
} from "@/domain/calculations";

const sel = (entries: [string, AttendanceStatus][]) => new Map(entries);

describe("summarizeAttendance", () => {
  it("separates confirmed, tentative, declined and unanswered", () => {
    const counts = summarizeAttendance(
      ["a", "b", "c", "d", "e"],
      sel([
        ["a", "attending"],
        ["b", "maybe"],
        ["c", "not_attending"],
        ["d", "attending"],
      ]),
    );
    expect(counts).toEqual({ invited: 5, confirmed: 2, tentative: 1, declined: 1, unanswered: 1 });
  });

  it("treats a missing selection as unanswered, never declined", () => {
    expect(summarizeAttendance(["a"], new Map())).toMatchObject({ declined: 0, unanswered: 1 });
  });

  it("ignores selections from guests who are no longer eligible", () => {
    const counts = summarizeAttendance(["a"], sel([["a", "attending"], ["revoked-guest", "attending"]]));
    expect(counts.confirmed).toBe(1);
    expect(counts.invited).toBe(1);
  });

  it("counts each person once even if listed twice", () => {
    expect(summarizeAttendance(["a", "a"], sel([["a", "attending"]])).confirmed).toBe(1);
  });
});

describe("expectedAttendance", () => {
  it("weights tentative guests and never unanswered ones", () => {
    expect(expectedAttendance({ confirmed: 10, tentative: 4 }, 0.5)).toBe(12);
    expect(expectedAttendance({ confirmed: 10, tentative: 4 }, 0)).toBe(10);
  });
  it("clamps the weight to 0..1", () => {
    expect(expectedAttendance({ confirmed: 1, tentative: 1 }, 5)).toBe(2);
  });
});

describe("accommodation", () => {
  it("uses half-open intervals: 21 → 24 November is three nights", () => {
    expect(nightsInStay("2026-11-21", "2026-11-24")).toBe(3);
  });

  it("rejects zero or negative stays", () => {
    expect(() => nightsInStay("2026-11-21", "2026-11-21")).toThrow();
  });

  it("two people sharing one room for three nights = 3 room-nights, 6 guest-nights", () => {
    const t = accommodationTotals([
      { id: "r1", arrivalDate: "2026-11-21", departureDate: "2026-11-24", guestIds: ["a", "b"], roomCount: 1 },
    ]);
    expect(t.roomNights).toBe(3);
    expect(t.guestNights).toBe(6);
    expect(t.nights.map((n) => n.date)).toEqual(["2026-11-21", "2026-11-22", "2026-11-23"]);
    expect(t.arrivals["2026-11-21"]).toBe(2);
    expect(t.departures["2026-11-24"]).toBe(2);
  });

  it("does not double count a guest in overlapping requests", () => {
    const t = accommodationTotals([
      { id: "r1", arrivalDate: "2026-11-21", departureDate: "2026-11-23", guestIds: ["a"], roomCount: 1 },
      { id: "r2", arrivalDate: "2026-11-22", departureDate: "2026-11-24", guestIds: ["a"], roomCount: 1 },
    ]);
    expect(t.guestNights).toBe(3);
    expect(t.roomNights).toBe(4);
    expect(t.distinctGuests).toBe(1);
  });

  it("tracks requests without a room count separately", () => {
    const t = accommodationTotals([
      { id: "r1", arrivalDate: "2026-11-21", departureDate: "2026-11-22", guestIds: ["a", "b", "c"], roomCount: null },
    ]);
    expect(t.roomNights).toBe(0);
    expect(t.requestsWithoutRoomCount).toBe(1);
    expect(t.nights[0].roomsUnknown).toBe(true);
    expect(t.guestNights).toBe(3);
  });

  it("identifies the night before a service date", () => {
    const stay = { arrivalDate: "2026-11-21", departureDate: "2026-11-23" };
    expect(staysNightBefore(stay, "2026-11-22")).toBe(true);
    expect(staysNightBefore(stay, "2026-11-23")).toBe(true);
    expect(staysNightBefore(stay, "2026-11-21")).toBe(false);
    expect(staysNightBefore(stay, "2026-11-24")).toBe(false);
  });
});

describe("computeMealCount", () => {
  const attendance = new Map([
    ["haldi", sel([["a", "attending"], ["b", "attending"], ["c", "maybe"]])],
    ["mehendi", sel([["a", "attending"], ["d", "attending"], ["e", "not_attending"]])],
  ]);
  const base = {
    attendance,
    staysByGuest: new Map([["a", [{ arrivalDate: "2026-11-21", departureDate: "2026-11-23" }]]]),
    overrides: new Map(),
    dietaryByGuest: new Map([
      ["a", ["vegetarian", "jain"]],
      ["b", ["vegetarian"]],
    ]),
  };

  it("counts each attendee once across linked activities", () => {
    const m = computeMealCount({ id: "lunch", serviceDate: "2026-11-22", basis: "activity", activityIds: ["haldi", "mehendi"] }, base);
    expect(m.confirmed).toBe(3);
    expect(m.tentative).toBe(1);
  });

  it("allows multiple dietary restrictions per guest", () => {
    const m = computeMealCount({ id: "lunch", serviceDate: "2026-11-22", basis: "activity", activityIds: ["haldi", "mehendi"] }, base);
    expect(m.dietary).toEqual({ vegetarian: 2, jain: 1 });
    expect(m.noRestrictions).toBe(1);
  });

  it("applies opt-outs and opt-ins", () => {
    const overrides = new Map([["lunch", new Map<string, "opted_in" | "opted_out">([["a", "opted_out"], ["z", "opted_in"], ["c", "opted_out"]])]]);
    const m = computeMealCount({ id: "lunch", serviceDate: "2026-11-22", basis: "activity", activityIds: ["haldi"] }, { ...base, overrides });
    expect(m.confirmedGuestIds.sort()).toEqual(["b", "z"]);
    expect(m.tentative).toBe(0);
  });

  it("does not assume every attendee eats every meal of the day", () => {
    const m = computeMealCount({ id: "dinner", serviceDate: "2026-11-22", basis: "activity", activityIds: ["mehendi"] }, base);
    expect(m.confirmedGuestIds.sort()).toEqual(["a", "d"]);
  });

  it("counts overnight guests for breakfast", () => {
    const m = computeMealCount({ id: "bf", serviceDate: "2026-11-22", basis: "overnight", activityIds: [] }, base);
    expect(m.confirmedGuestIds).toEqual(["a"]);
    const m2 = computeMealCount({ id: "bf", serviceDate: "2026-11-21", basis: "overnight", activityIds: [] }, base);
    expect(m2.confirmed).toBe(0);
  });
});

describe("availability", () => {
  it("summarises slots and ranks without choosing a winner", () => {
    const s1 = availabilityForSlot("s1", { invited: 10, confirmed: 6, tentative: 1, declined: 2, unanswered: 1 }, 8);
    const s2 = availabilityForSlot("s2", { invited: 10, confirmed: 8, tentative: 0, declined: 2, unanswered: 0 }, 8);
    expect(s1.availableShare).toBeCloseTo(0.6);
    expect(s1.meetsMinimum).toBe(false);
    expect(s2.meetsMinimum).toBe(true);
    expect(rankSlots([s1, s2]).map((s) => s.activityId)).toEqual(["s2", "s1"]);
  });
});
