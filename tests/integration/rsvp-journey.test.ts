import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/server/db/connect";
import { events, invitations, notificationJobs } from "@/server/db/schema";
import { decrypt } from "@/server/lib/crypto";
import { AppError } from "@/server/lib/errors";
import { setEmailProvider, type EmailMessage } from "@/server/adapters/email";
import { requireEventAccess } from "@/server/modules/access";
import { addCollaborator, createActivity, createEvent, updateEventSettings } from "@/server/modules/events";
import { exportCsv } from "@/server/modules/exports";
import { createGroup, createGuest, createHousehold, importGuests, setGroupMembership } from "@/server/modules/guests";
import { createInvitation, resolveInvitationToken, revokeInvitation } from "@/server/modules/invitations";
import { createMeal } from "@/server/modules/logistics";
import { enqueueNotification, processDueNotifications } from "@/server/modules/notifications";
import { getAccommodationReport, getAttendeeList, getEventSummary, getMealReport } from "@/server/modules/reporting";
import { getRsvpView, submitResponse, type ResponsePayload } from "@/server/modules/rsvp";
import { createTestDb, createUser } from "../support/db";

const tokenOf = (inv: { tokenCiphertext: string }) => decrypt(inv.tokenCiphertext);

async function expectAppError(p: Promise<unknown>, code: AppError["code"]) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === code);
}

async function viewFor(db: Database, inv: { tokenCiphertext: string }) {
  const resolved = await resolveInvitationToken(db, tokenOf(inv));
  if (!resolved) throw new Error("token did not resolve");
  return getRsvpView(db, resolved);
}

describe("multi-day wedding journey", () => {
  let db: Database;
  let host: { id: string };
  let eventId: string;
  const act: Record<string, string> = {};
  let sharma: typeof invitations.$inferSelect;
  let people: Record<string, string>;
  let solo: typeof invitations.$inferSelect;
  const outbox: EmailMessage[] = [];

  beforeAll(async () => {
    db = await createTestDb();
    setEmailProvider({ name: "test", send: async (m) => void outbox.push(m) });
    host = await createUser(db, "Purva");
    const event = await createEvent(db, host.id, {
      name: "Purva & Anupam",
      eventType: "wedding",
      timezone: "Asia/Kolkata",
      startDate: "2026-11-21",
      endDate: "2026-11-23",
      useTemplate: false,
    });
    eventId = event.id;
    await updateEventSettings(db, host.id, eventId, {
      features: { accommodation: true, meals: true, dietary: true, transport: true },
    });
    const schedule: [string, string, string][] = [
      ["Mehendi", "2026-11-21", "16:00"],
      ["Haldi", "2026-11-22", "10:00"],
      ["Sangeet", "2026-11-22", "19:00"],
      ["Wedding", "2026-11-23", "11:00"],
      ["Reception", "2026-11-23", "19:00"],
    ];
    for (const [name, date, startTime] of schedule) {
      act[name] = (await createActivity(db, host.id, eventId, { name, date, startTime })).id;
    }
    const household = await createHousehold(db, host.id, eventId, {
      name: "Sharma family",
      members: [{ name: "Anupam" }, { name: "Purva", email: "purva@example.com" }, { name: "Parent 1" }, { name: "Parent 2" }],
    });
    sharma = await createInvitation(db, host.id, eventId, { householdId: household.id });
    const view = await viewFor(db, sharma);
    people = Object.fromEntries(view.people.map((p) => [p.name, p.id]));
    const g = await createGuest(db, host.id, eventId, { name: "Solo Guest" });
    solo = await createInvitation(db, host.id, eventId, { guestId: g.id });
  });

  it("creates a wedding with three dates and five activities", async () => {
    const view = await viewFor(db, sharma);
    expect(view.activities.map((a) => a.name)).toEqual(["Mehendi", "Haldi", "Sangeet", "Wedding", "Reception"]);
    expect(new Set(view.activities.map((a) => a.startAt.slice(0, 10))).size).toBe(3);
    expect(view.people).toHaveLength(4);
  });

  it("starts with everyone unanswered, not declined", async () => {
    const s = await getEventSummary(db, host.id, eventId);
    const wedding = s.activities.find((a) => a.name === "Wedding")!;
    expect(wedding).toMatchObject({ invited: 5, confirmed: 0, declined: 0, unanswered: 5 });
  });

  it("records per-person attendance and shows correct headcounts", async () => {
    const all = Object.values(act);
    const attendance: ResponsePayload["attendance"] = [];
    for (const a of all) {
      attendance.push({ personKey: people["Anupam"], activityId: a, status: "attending" });
      attendance.push({ personKey: people["Purva"], activityId: a, status: "attending" });
      attendance.push({ personKey: people["Parent 1"], activityId: a, status: a === act.Wedding ? "attending" : "not_attending" });
      attendance.push({ personKey: people["Parent 2"], activityId: a, status: "not_attending" });
    }
    const res = await submitResponse(db, {
      invitationId: sharma.id,
      actor: { kind: "invitation", invitationId: sharma.id },
      payload: {
        expectedVersion: 0,
        people: [{ key: people["Anupam"], dietary: ["vegetarian", "jain"] }, { key: people["Purva"], dietary: ["vegetarian"] }],
        attendance,
        accommodation: [
          { arrivalDate: "2026-11-21", departureDate: "2026-11-24", personKeys: [people["Anupam"], people["Purva"]], roomCount: 1 },
        ],
      },
    });
    expect(res).toMatchObject({ version: 1, responseStatus: "submitted", isLate: false });

    const s = await getEventSummary(db, host.id, eventId);
    const by = Object.fromEntries(s.activities.map((a) => [a.name, a]));
    expect(by.Wedding).toMatchObject({ invited: 5, confirmed: 3, tentative: 0, declined: 1, unanswered: 1 });
    expect(by.Mehendi).toMatchObject({ confirmed: 2, declined: 2, unanswered: 1 });
    expect(s.totals).toMatchObject({ invitedPeople: 5, respondedPeople: 4, invitationsPending: 1 });

    // Counts match the attendee-level drill-down.
    const list = await getAttendeeList(db, host.id, eventId, { activityId: act.Wedding, status: "attending" });
    expect(list.rows.map((r) => r.name).sort()).toEqual(["Anupam", "Parent 1", "Purva"]);
    const unanswered = await getAttendeeList(db, host.id, eventId, { activityId: act.Wedding, status: "unanswered" });
    expect(unanswered.rows.map((r) => r.name)).toEqual(["Solo Guest"]);
  });

  it("computes accommodation guest-nights and room-nights", async () => {
    const r = await getAccommodationReport(db, host.id, eventId);
    expect(r.totals.guestNights).toBe(6);
    expect(r.totals.roomNights).toBe(3);
    expect(r.awaiting).toBe(1);
    expect(r.items[0].issues).toContain("Awaiting room assignment");
  });

  it("derives meal counts from configured rules", async () => {
    await createMeal(db, host.id, eventId, { name: "Lunch", serviceDate: "2026-11-23", serviceTime: "13:00", basis: "activity", activityIds: [act.Wedding] });
    await createMeal(db, host.id, eventId, { name: "Dinner", serviceDate: "2026-11-22", basis: "activity", activityIds: [act.Sangeet] });
    await createMeal(db, host.id, eventId, { name: "Breakfast", serviceDate: "2026-11-22", basis: "overnight" });
    const r = await getMealReport(db, host.id, eventId);
    const by = Object.fromEntries(r.meals.map((m) => [`${m.name}@${m.serviceDate}`, m]));
    expect(by["Lunch@2026-11-23"]).toMatchObject({ confirmed: 3, dietary: { vegetarian: 2, jain: 1 }, noRestrictions: 1 });
    expect(by["Dinner@2026-11-22"].confirmed).toBe(2);
    expect(by["Breakfast@2026-11-22"].confirmed).toBe(2);
  });

  it("updates aggregates when a guest changes their plans, and keeps history", async () => {
    const view = await viewFor(db, sharma);
    const attendance = view.attendance.map((a) => ({
      personKey: a.guestId,
      activityId: a.activityId,
      status: a.guestId === people["Parent 1"] && a.activityId === act.Reception ? ("attending" as const) : a.status,
    }));
    const res = await submitResponse(db, {
      invitationId: sharma.id,
      actor: { kind: "invitation", invitationId: sharma.id },
      payload: {
        expectedVersion: view.invitation.responseVersion,
        people: view.people.map((p) => ({ key: p.id, dietary: p.dietary })),
        attendance,
        accommodation: view.accommodation.map((a) => ({ ...a, personKeys: a.guestIds })),
      },
    });
    expect(res.responseStatus).toBe("updated");
    expect(res.changes).toEqual([{ type: "attendance", guest: "Parent 1", activity: "Reception", from: "not_attending", to: "attending" }]);
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.activities.find((a) => a.name === "Reception")!.confirmed).toBe(3);
    expect(s.recent[0].changes[0]).toMatchObject({ guest: "Parent 1" });
    // Accommodation was resubmitted unchanged and stays a single request.
    expect((await getAccommodationReport(db, host.id, eventId)).items.filter((i) => i.active)).toHaveLength(1);
  });

  it("rejects stale versions instead of silently overwriting", async () => {
    await expectAppError(
      submitResponse(db, {
        invitationId: sharma.id,
        actor: { kind: "invitation", invitationId: sharma.id },
        payload: { expectedVersion: 0, people: [], attendance: [] },
      }),
      "conflict",
    );
  });

  it("does not let one household see or edit another household's response", async () => {
    const other = await createHousehold(db, host.id, eventId, { name: "Iyer family", members: [{ name: "Kavya" }] });
    const iyer = await createInvitation(db, host.id, eventId, { householdId: other.id });
    const view = await viewFor(db, iyer);
    expect(view.people.map((p) => p.name)).toEqual(["Kavya"]);
    expect(view.attendance).toEqual([]);
    const json = JSON.stringify(view);
    for (const name of ["Parent 1", "Parent 2"]) expect(json).not.toContain(name);
    for (const id of Object.values(people)) expect(json).not.toContain(id);
    await expectAppError(
      submitResponse(db, {
        invitationId: iyer.id,
        actor: { kind: "invitation", invitationId: iyer.id },
        payload: { expectedVersion: 0, people: [], attendance: [{ personKey: people["Anupam"], activityId: act.Wedding, status: "not_attending" }] },
      }),
      "validation_error",
    );
  });

  it("prevents a guest being covered by two active invitations", async () => {
    await expectAppError(createInvitation(db, host.id, eventId, { guestId: people["Anupam"] }), "conflict");
  });

  it("enforces plus-one limits and counts plus-ones as individuals", async () => {
    await expectAppError(
      submitResponse(db, {
        invitationId: solo.id,
        actor: { kind: "invitation", invitationId: solo.id },
        payload: { expectedVersion: 0, people: [{ key: "new:1", name: "Friend" }], attendance: [] },
      }),
      "validation_error",
    );
    await db.update(invitations).set({ plusOnesAllowed: 1 }).where(eq(invitations.id, solo.id));
    const view = await viewFor(db, solo);
    const soloId = view.people[0].id;
    await expectAppError(
      submitResponse(db, {
        invitationId: solo.id,
        actor: { kind: "invitation", invitationId: solo.id },
        payload: { expectedVersion: 0, people: [{ key: "new:1", name: "A" }, { key: "new:2", name: "B" }], attendance: [] },
      }),
      "validation_error",
    );
    await submitResponse(db, {
      invitationId: solo.id,
      actor: { kind: "invitation", invitationId: solo.id },
      payload: {
        expectedVersion: 0,
        people: [{ key: "new:1", name: "Plus One" }],
        attendance: [
          { personKey: soloId, activityId: act.Wedding, status: "attending" },
          { personKey: "new:1", activityId: act.Wedding, status: "maybe" },
        ],
      },
    });
    const s = await getEventSummary(db, host.id, eventId);
    const wedding = s.activities.find((a) => a.name === "Wedding")!;
    expect(wedding).toMatchObject({ confirmed: 4, tentative: 1 });
    expect(s.totals.plusOnes).toBe(1);
  });

  it("blocks revoked invitations from viewing or modifying responses", async () => {
    const token = tokenOf(solo);
    await revokeInvitation(db, host.id, solo.id);
    expect(await resolveInvitationToken(db, token)).toBeNull();
    await expectAppError(
      submitResponse(db, {
        invitationId: solo.id,
        actor: { kind: "invitation", invitationId: solo.id },
        payload: { expectedVersion: 1, people: [], attendance: [] },
      }),
      "not_found",
    );
    // Revoked guests no longer count.
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.activities.find((a) => a.name === "Wedding")!.confirmed).toBe(3);
  });

  it("applies the late-change policy after the deadline", async () => {
    await db.update(events).set({ rsvpDeadline: new Date(Date.now() - 60_000) }).where(eq(events.id, eventId));
    const view = await viewFor(db, sharma);
    const payload = {
      expectedVersion: view.invitation.responseVersion,
      people: [],
      attendance: view.attendance.map((a) => ({ personKey: a.guestId, activityId: a.activityId, status: a.status })),
      accommodation: view.accommodation.map((a) => ({ ...a, personKeys: a.guestIds })),
    };
    const late = await submitResponse(db, { invitationId: sharma.id, actor: { kind: "invitation", invitationId: sharma.id }, payload });
    expect(late.isLate).toBe(true);
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, sharma.id));
    expect(inv.hasLateChanges).toBe(true);

    await updateEventSettings(db, host.id, eventId, { latePolicy: "reject" });
    await expectAppError(
      submitResponse(db, {
        invitationId: sharma.id,
        actor: { kind: "invitation", invitationId: sharma.id },
        payload: { ...payload, expectedVersion: late.version },
      }),
      "rsvp_closed",
    );
    // Hosts can still make exceptional changes.
    const hostEdit = await submitResponse(db, {
      invitationId: sharma.id,
      actor: { kind: "user", userId: host.id },
      payload: { ...payload, expectedVersion: late.version },
    });
    expect(hostEdit.isLate).toBe(false);
    await db.update(events).set({ rsvpDeadline: null }).where(eq(events.id, eventId));
    await updateEventSettings(db, host.id, eventId, { latePolicy: "accept_flag" });
  });

  it("queues idempotent notifications and retries failures", async () => {
    const jobs = await db.select().from(notificationJobs).where(eq(notificationJobs.eventId, eventId));
    expect(jobs.some((j) => j.templateKey === "host_response")).toBe(true);
    expect(jobs.some((j) => j.templateKey === "guest_confirmation" && j.recipient === "purva@example.com")).toBe(true);
    const before = jobs.length;
    await enqueueNotification(db, { ...jobs[0], templateKey: jobs[0].templateKey as "host_response", payload: {}, eventId });
    expect((await db.select().from(notificationJobs).where(eq(notificationJobs.eventId, eventId))).length).toBe(before);

    const r = await processDueNotifications(db, 100);
    expect(r.failed).toBe(0);
    expect(r.sent).toBe(before);
    expect(outbox.some((m) => m.subject.includes("Purva & Anupam"))).toBe(true);
    // Guest emails carry a working personal link.
    const confirmation = outbox.find((m) => m.to === "purva@example.com")!;
    expect(confirmation.text).toContain(`/i/${tokenOf(sharma)}`);

    setEmailProvider({ name: "broken", send: async () => { throw new Error("provider down"); } });
    await enqueueNotification(db, { eventId, idempotencyKey: "retry-test", recipient: "x@example.com", templateKey: "host_response", payload: { eventId, eventName: "E", label: "L" } });
    expect(await processDueNotifications(db)).toEqual({ sent: 0, failed: 1 });
    const [job] = await db.select().from(notificationJobs).where(eq(notificationJobs.idempotencyKey, "retry-test"));
    expect(job).toMatchObject({ status: "pending", attemptCount: 1, lastError: "provider down" });
    setEmailProvider({ name: "test", send: async (m) => void outbox.push(m) });
  });

  it("withdrawal clears attendance back to unanswered", async () => {
    const view = await viewFor(db, sharma);
    await submitResponse(db, {
      invitationId: sharma.id,
      actor: { kind: "invitation", invitationId: sharma.id },
      payload: { expectedVersion: view.invitation.responseVersion },
      mode: "withdraw",
    });
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.activities.find((a) => a.name === "Wedding")).toMatchObject({ confirmed: 0, declined: 0 });
    expect(s.totals.invitationsWithdrawn).toBe(1);
    expect((await getAccommodationReport(db, host.id, eventId)).totals.guestNights).toBe(0);
  });

  it("isolates events between hosts and restricts exports by role", async () => {
    const stranger = await createUser(db, "Stranger");
    await expectAppError(requireEventAccess(db, stranger.id, eventId, "view"), "not_found");
    await expectAppError(getEventSummary(db, stranger.id, eventId), "not_found");
    await expectAppError(exportCsv(db, stranger.id, eventId, "guests"), "not_found");

    const viewer = await createUser(db, "Viewer");
    const [vu] = await db.select().from((await import("@/server/db/schema")).users).where(eq((await import("@/server/db/schema")).users.id, viewer.id));
    await addCollaborator(db, host.id, eventId, { email: vu.email, role: "viewer" });
    await expect(getEventSummary(db, viewer.id, eventId)).resolves.toBeTruthy();
    await expectAppError(exportCsv(db, viewer.id, eventId, "guests"), "forbidden");
    await expectAppError(createGuest(db, viewer.id, eventId, { name: "Nope" }), "forbidden");
  });

  it("exports an accurate guest CSV", async () => {
    const { stream, filename } = await exportCsv(db, host.id, eventId, "guests");
    expect(filename).toMatch(/purva-anupam-guests-\d{4}-\d{2}-\d{2}\.csv/);
    const csv = await new Response(stream).text();
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("Mehendi,Haldi,Sangeet,Wedding,Reception");
    expect(lines.find((l) => l.startsWith("Anupam,"))).toContain("Sharma family");
  });
});

describe("guest management", () => {
  let db: Database;
  let host: { id: string };
  let eventId: string;

  beforeAll(async () => {
    db = await createTestDb();
    host = await createUser(db);
    eventId = (await createEvent(db, host.id, { name: "Birthday", eventType: "birthday", startDate: "2026-12-05", endDate: "2026-12-05" })).id;
  });

  it("applies template defaults", async () => {
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.activities.map((a) => a.name)).toEqual(["Birthday party"]);
    expect(s.settings.features.plusOnes).toBe(true);
  });

  it("imports guests, reports row errors and deduplicates", async () => {
    await createGuest(db, host.id, eventId, { name: "Existing", email: "existing@example.com" });
    const results = await importGuests(
      db,
      host.id,
      eventId,
      [
        "name,email,phone,household,groups",
        "Asha,asha@example.com,+91 9876543210,Rao family,Friends; VIP",
        "Ravi,,9876500000,Rao family,Friends",
        ",nobody@example.com,,,",
        "Bad Email,not-an-email,,,",
        "Existing Again,EXISTING@example.com,,,VIP",
        "Asha duplicate,asha@example.com,,,",
      ].join("\n"),
    );
    expect(results.map((r) => r.status)).toEqual(["created", "created", "error", "error", "merged", "merged"]);
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.totals.guests).toBe(3);
  });

  it("does not duplicate guests who belong to several groups", async () => {
    const g = await createGuest(db, host.id, eventId, { name: "Multi" });
    const a = await createGroup(db, host.id, eventId, { name: "Cousins" });
    const b = await createGroup(db, host.id, eventId, { name: "Neighbours" });
    await setGroupMembership(db, host.id, eventId, { groupId: a.id, guestIds: [g.id], member: true });
    await setGroupMembership(db, host.id, eventId, { groupId: b.id, guestIds: [g.id], member: true });
    await setGroupMembership(db, host.id, eventId, { groupId: b.id, guestIds: [g.id], member: true });
    const s = await getEventSummary(db, host.id, eventId);
    expect(s.totals.guests).toBe(4);
  });

  it("limits activities to eligible groups", async () => {
    const family = await createGroup(db, host.id, eventId, { name: "Inner circle" });
    const vip = await createGuest(db, host.id, eventId, { name: "VIP person", groupIds: [family.id] });
    const other = await createGuest(db, host.id, eventId, { name: "Other person" });
    await createActivity(db, host.id, eventId, {
      name: "Family brunch",
      date: "2026-12-05",
      startTime: "10:00",
      eligibility: "groups",
      eligibleGroupIds: [family.id],
    });
    const i1 = await createInvitation(db, host.id, eventId, { guestId: vip.id });
    const i2 = await createInvitation(db, host.id, eventId, { guestId: other.id });
    expect((await viewFor(db, i1)).activities.map((a) => a.name)).toContain("Family brunch");
    expect((await viewFor(db, i2)).activities.map((a) => a.name)).not.toContain("Family brunch");
    const brunch = (await viewFor(db, i1)).activities.find((a) => a.name === "Family brunch")!;
    await expectAppError(
      submitResponse(db, {
        invitationId: i2.id,
        actor: { kind: "invitation", invitationId: i2.id },
        payload: { expectedVersion: 0, people: [], attendance: [{ personKey: other.id, activityId: brunch.id, status: "attending" }] },
      }),
      "validation_error",
    );
  });

  it("enforces activity capacity across parties", async () => {
    const limited = await createActivity(db, host.id, eventId, { name: "Cake cutting", date: "2026-12-05", startTime: "20:00", capacity: 1 });
    const a = await createGuest(db, host.id, eventId, { name: "Cap A" });
    const b = await createGuest(db, host.id, eventId, { name: "Cap B" });
    const ia = await createInvitation(db, host.id, eventId, { guestId: a.id });
    const ib = await createInvitation(db, host.id, eventId, { guestId: b.id });
    await submitResponse(db, {
      invitationId: ia.id,
      actor: { kind: "invitation", invitationId: ia.id },
      payload: { expectedVersion: 0, people: [], attendance: [{ personKey: a.id, activityId: limited.id, status: "attending" }] },
    });
    await expectAppError(
      submitResponse(db, {
        invitationId: ib.id,
        actor: { kind: "invitation", invitationId: ib.id },
        payload: { expectedVersion: 0, people: [], attendance: [{ personKey: b.id, activityId: limited.id, status: "attending" }] },
      }),
      "conflict",
    );
    expect((await viewFor(db, ib)).activities.find((x) => x.id === limited.id)!.isFull).toBe(true);
    // The first party can resubmit without losing their seat.
    await submitResponse(db, {
      invitationId: ia.id,
      actor: { kind: "invitation", invitationId: ia.id },
      payload: { expectedVersion: 1, people: [], attendance: [{ personKey: a.id, activityId: limited.id, status: "attending" }] },
    });
  });

  it("serialises concurrent submissions for the same invitation", async () => {
    const g = await createGuest(db, host.id, eventId, { name: "Racer" });
    const inv = await createInvitation(db, host.id, eventId, { guestId: g.id });
    const submit = () =>
      submitResponse(db, {
        invitationId: inv.id,
        actor: { kind: "invitation", invitationId: inv.id },
        payload: { expectedVersion: 0, people: [], attendance: [] },
      });
    const results = await Promise.allSettled([submit(), submit()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
});

describe("sports availability", () => {
  it("collects availability across candidate slots", async () => {
    const db = await createTestDb();
    const host = await createUser(db, "Captain");
    const event = await createEvent(db, host.id, { name: "Sunday cricket", eventType: "sports", startDate: "2026-11-28", endDate: "2026-11-29" });
    const players = await Promise.all(["P1", "P2", "P3", "P4"].map((name) => createGuest(db, host.id, event.id, { name })));
    const invs = await Promise.all(players.map((p) => createInvitation(db, host.id, event.id, { guestId: p.id })));
    const view = await viewFor(db, invs[0]);
    const [morning, evening, nextMorning] = view.activities.map((a) => a.id);
    expect(view.activities).toHaveLength(3);
    expect(view.event.settings.availabilityMode).toBe(true);

    const plan: ("attending" | "maybe" | "not_attending")[][] = [
      ["attending", "not_attending", "attending"],
      ["attending", "maybe", "attending"],
      ["not_attending", "attending", "attending"],
    ];
    for (const [i, statuses] of plan.entries()) {
      await submitResponse(db, {
        invitationId: invs[i].id,
        actor: { kind: "invitation", invitationId: invs[i].id },
        payload: {
          expectedVersion: 0,
          people: [],
          attendance: [morning, evening, nextMorning].map((activityId, k) => ({ personKey: players[i].id, activityId, status: statuses[k] })),
        },
      });
    }
    await updateEventSettings(db, host.id, event.id, { minParticipants: 3 });
    const s = await getEventSummary(db, host.id, event.id);
    const slot = Object.fromEntries(s.slots.map((x) => [x.activityId, x]));
    expect(slot[morning]).toMatchObject({ available: 2, ifNeeded: 0, unavailable: 1, unanswered: 1, meetsMinimum: false });
    expect(slot[evening]).toMatchObject({ available: 1, ifNeeded: 1 });
    expect(slot[nextMorning]).toMatchObject({ available: 3, meetsMinimum: true, availableShare: 0.75 });
    expect(s.slots[0].activityId).toBe(nextMorning);
  });
});
