// Rough latency check for the hot paths on a large event. Development only:
// creates a throwaway host and event in the configured database.
//   DATABASE_URL=... npx tsx scripts/bench.ts [households=500]
import "./env";
import { performance } from "node:perf_hooks";
import { eq } from "drizzle-orm";
import { createDatabase, isLocalDatabaseUrl } from "../src/server/db/connect";
import { invitations } from "../src/server/db/schema";
import { createEvent, deleteEvent, listActivities } from "../src/server/modules/events";
import { importGuests } from "../src/server/modules/guests";
import { inviteAllUninvited, listInvitations } from "../src/server/modules/invitations";
import { signup } from "../src/server/modules/identity";
import { getAccommodationReport, getEventSummary, getMealReport } from "../src/server/modules/reporting";
import { getRsvpView, submitResponse } from "../src/server/modules/rsvp";

const HOUSEHOLDS = Number(process.argv[2] ?? 500);

async function time<T>(label: string, runs: number, fn: () => Promise<T>) {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    await fn();
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  const p = (q: number) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))].toFixed(0);
  console.log(`${label.padEnd(28)} p50 ${p(0.5)} ms   p95 ${p(0.95)} ms   (n=${runs})`);
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Do not run against production.");
  if (process.env.DATABASE_URL && !isLocalDatabaseUrl(process.env.DATABASE_URL) && process.env.ALLOW_REMOTE_DATABASE !== "true") {
    throw new Error("DATABASE_URL points at a remote database (check .env.local). Set ALLOW_REMOTE_DATABASE=true if you really mean it.");
  }
  const db = await createDatabase(process.env);
  const host = await signup(db, { name: "Bench", email: `bench-${Date.now()}@example.com`, password: "bench-password-123" });
  const event = await createEvent(db, host.id, { name: "Bench wedding", eventType: "wedding", startDate: "2027-01-10", endDate: "2027-01-12" });
  const csv = ["name,household,groups"];
  for (let h = 0; h < HOUSEHOLDS; h++) for (let m = 0; m < 4; m++) csv.push(`Guest ${h}-${m},Family ${h},${m % 2 ? "Friends" : "Out-of-town guests"}`);
  // Imports are capped at 2,000 rows each.
  for (let start = 1; start < csv.length; start += 2000) {
    await importGuests(db, host.id, event.id, [csv[0], ...csv.slice(start, start + 2000)].join("\n"));
  }
  await inviteAllUninvited(db, host.id, event.id);
  const acts = await listActivities(db, event.id);
  const rows = await listInvitations(db, host.id, event.id);
  console.log(`Event with ${HOUSEHOLDS * 4} guests, ${rows.length} invitations, ${acts.length} activities.`);

  // Two thirds respond.
  const respond = rows.slice(0, Math.floor((rows.length * 2) / 3));
  let i = 0;
  await time("RSVP submission", Math.min(60, respond.length), async () => {
    const r = respond[i++];
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, r.invitation.id));
    const view = await getRsvpView(db, { invitation: inv, event });
    await submitResponse(db, {
      invitationId: inv.id,
      actor: { kind: "invitation", invitationId: inv.id },
      payload: {
        expectedVersion: 0,
        people: [],
        attendance: view.people.flatMap((p, k) => acts.map((a, j) => ({ personKey: p.id, activityId: a.id, status: (k + j) % 4 ? ("attending" as const) : ("maybe" as const) }))),
        accommodation: [{ arrivalDate: "2027-01-10", departureDate: "2027-01-13", personKeys: view.people.map((p) => p.id), roomCount: 2 }],
      },
    });
  });
  for (; i < respond.length; i++) {
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, respond[i].invitation.id));
    const view = await getRsvpView(db, { invitation: inv, event });
    await submitResponse(db, {
      invitationId: inv.id,
      actor: { kind: "invitation", invitationId: inv.id },
      payload: { expectedVersion: 0, people: [], attendance: view.people.flatMap((p) => acts.map((a) => ({ personKey: p.id, activityId: a.id, status: "attending" as const }))) },
    });
  }

  const [inv] = await db.select().from(invitations).where(eq(invitations.id, rows[0].invitation.id));
  await time("Guest invitation view", 30, () => getRsvpView(db, { invitation: inv, event }));
  await time("Dashboard summary", 20, () => getEventSummary(db, host.id, event.id));
  await time("Meal report", 10, () => getMealReport(db, host.id, event.id));
  await time("Accommodation report", 10, () => getAccommodationReport(db, host.id, event.id));

  await deleteEvent(db, host.id, event.id, event.name);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
