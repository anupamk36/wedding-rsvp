// Creates a clearly labelled demo host and a sample multi-day wedding with
// households, invitations and a few responses. Safe to run more than once.
import "./env";
import { eq, sql } from "drizzle-orm";
import { createDatabase } from "../src/server/db/connect";
import { users } from "../src/server/db/schema";
import { addDays } from "../src/lib/dates";
import { createEvent, listActivities, updateEventSettings } from "../src/server/modules/events";
import { createGuest, createHousehold } from "../src/server/modules/guests";
import { inviteAllUninvited, listInvitations } from "../src/server/modules/invitations";
import { signup } from "../src/server/modules/identity";
import { getRsvpView, submitResponse } from "../src/server/modules/rsvp";
import { invitations } from "../src/server/db/schema";

const DEMO_EMAIL = process.env.SEED_EMAIL ?? "demo@gatherly.test";
const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "demo-password-123";

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED !== "true") throw new Error("Refusing to seed production.");
  const db = await createDatabase(process.env);
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${DEMO_EMAIL}`);
  const host = existing ?? (await signup(db, { name: "Demo Host", email: DEMO_EMAIL, password: DEMO_PASSWORD }));

  const start = addDays(new Date().toISOString().slice(0, 10), 30);
  const event = await createEvent(db, host.id, {
    name: "[Demo] Purva & Anupam's Wedding",
    hostDisplayName: "The Sharma & Iyer families",
    eventType: "wedding",
    timezone: "Asia/Kolkata",
    startDate: start,
    endDate: addDays(start, 2),
    venueName: "Lakeside Palace, Udaipur",
    description: "Example data — feel free to edit or delete this event.",
  });
  await updateEventSettings(db, host.id, event.id, { showForecast: true });

  await createHousehold(db, host.id, event.id, {
    name: "The Sharma family",
    members: [
      { name: "Rohit Sharma", email: "rohit.sharma@example.com", relationship: "Uncle" },
      { name: "Neha Sharma", relationship: "Aunt" },
      { name: "Aarav Sharma", relationship: "Cousin" },
      { name: "Dadi Sharma", relationship: "Grandmother" },
    ],
  });
  await createHousehold(db, host.id, event.id, {
    name: "The Iyer family",
    members: [{ name: "Kavya Iyer", email: "kavya.iyer@example.com" }, { name: "Vikram Iyer" }],
  });
  for (const name of ["Meera Kapoor", "Sam Fernandes", "Ishaan Gupta", "Zoya Khan"]) {
    await createGuest(db, host.id, event.id, { name });
  }
  await inviteAllUninvited(db, host.id, event.id, { plusOnesAllowed: 1 });

  // A couple of sample responses so the dashboard isn't empty.
  const acts = await listActivities(db, event.id);
  const rows = await listInvitations(db, host.id, event.id);
  const respond = rows.filter((r) => r.label !== "Zoya Khan" && r.label !== "Ishaan Gupta");
  for (const r of respond) {
    const [inv] = await db.select().from(invitations).where(eq(invitations.id, r.invitation.id));
    const view = await getRsvpView(db, { invitation: inv, event });
    // Mostly yes; the grandmother skips the late-night events and one cousin is unsure about the sangeet.
    const statusFor = (person: string, activity: string) =>
      person === "Dadi Sharma" && ["Sangeet", "Reception"].includes(activity)
        ? ("not_attending" as const)
        : person === "Aarav Sharma" && activity === "Sangeet"
          ? ("maybe" as const)
          : person === "Sam Fernandes" && activity === "Haldi"
            ? ("not_attending" as const)
            : ("attending" as const);
    await submitResponse(db, {
      invitationId: inv.id,
      actor: { kind: "invitation", invitationId: inv.id },
      payload: {
        expectedVersion: 0,
        people: view.people.map((p, i) => ({ key: p.id, dietary: i % 2 ? ["vegetarian"] : p.name === "Dadi Sharma" ? ["vegetarian", "jain"] : [] })),
        attendance: view.people.flatMap((p) => acts.map((a) => ({ personKey: p.id, activityId: a.id, status: statusFor(p.name, a.name) }))),
        accommodation:
          view.people.length > 1
            ? [{ arrivalDate: start, departureDate: addDays(start, 3), personKeys: view.people.map((p) => p.id), roomCount: Math.ceil(view.people.length / 2) }]
            : [],
        transport:
          r.label === "The Sharma family"
            ? [{ direction: "arrival" as const, travelDate: start, travelTime: "11:30", location: "Udaipur airport (UDR)", personKeys: view.people.map((p) => p.id), notes: "Flight 6E 2341" }]
            : [],
      },
    });
  }
  console.log(`Seeded demo event "${event.name}".`);
  console.log(`Sign in with ${DEMO_EMAIL} / ${existing ? "(existing password)" : DEMO_PASSWORD}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
