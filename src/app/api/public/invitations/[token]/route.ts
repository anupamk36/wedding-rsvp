import { publicRoute } from "@/server/http/api";
import { resolveOrThrow } from "@/server/http/public";
import { LIMITS } from "@/server/modules/rate-limit";
import { getRsvpView } from "@/server/modules/rsvp";

/** Event details and the activities this invitation may respond to. */
export const GET = publicRoute<{ token: string }>(LIMITS.publicRead, async ({ db, params, ip }) => {
  const view = await getRsvpView(db, await resolveOrThrow(db, params.token, ip));
  return { event: view.event, invitation: view.invitation, activities: view.activities };
});
