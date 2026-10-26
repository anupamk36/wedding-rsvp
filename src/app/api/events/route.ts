import { hostRoute, readJson } from "@/server/http/api";
import { createEvent, listEventsForUser, type EventInput } from "@/server/modules/events";

export const GET = hostRoute(async ({ db, user }) => ({ events: await listEventsForUser(db, user.id) }));

export const POST = hostRoute(async ({ req, db, user }) => {
  const body = (await readJson(req)) as EventInput & { useTemplate?: boolean };
  return Response.json({ event: await createEvent(db, user.id, body) }, { status: 201 });
});
