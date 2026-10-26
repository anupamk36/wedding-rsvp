import { hostRoute, readJson } from "@/server/http/api";
import { createGuest, listGuests, type GuestInput } from "@/server/modules/guests";

type P = { eventId: string };

/** Query: q, groupId, householdId, invited=yes|no, response, cursor, limit. */
export const GET = hostRoute<P>(async ({ req, db, user, params }) =>
  listGuests(db, user.id, params.eventId, Object.fromEntries(req.nextUrl.searchParams)),
);

export const POST = hostRoute<P>(async ({ req, db, user, params }) => {
  const guest = await createGuest(db, user.id, params.eventId, (await readJson(req)) as GuestInput);
  return Response.json({ guest }, { status: 201 });
});
