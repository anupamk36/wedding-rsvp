import { hostRoute, readJson } from "@/server/http/api";
import { requireEventAccess } from "@/server/modules/access";
import { createActivity, listActivities, type ActivityInput } from "@/server/modules/events";

type P = { eventId: string };

export const GET = hostRoute<P>(async ({ db, user, params }) => {
  await requireEventAccess(db, user.id, params.eventId, "view");
  return { activities: await listActivities(db, params.eventId) };
});

export const POST = hostRoute<P>(async ({ req, db, user, params }) => {
  const activity = await createActivity(db, user.id, params.eventId, (await readJson(req)) as ActivityInput);
  return Response.json({ activity }, { status: 201 });
});
