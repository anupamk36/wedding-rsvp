import { hostRoute, readJson } from "@/server/http/api";
import { deleteActivity, updateActivity, type ActivityInput } from "@/server/modules/events";

type P = { activityId: string };

export const PATCH = hostRoute<P>(async ({ req, db, user, params }) => ({
  activity: await updateActivity(db, user.id, params.activityId, (await readJson(req)) as ActivityInput),
}));

export const DELETE = hostRoute<P>(async ({ db, user, params }) => {
  await deleteActivity(db, user.id, params.activityId);
  return { ok: true };
});
