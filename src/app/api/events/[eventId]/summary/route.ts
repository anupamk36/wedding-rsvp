import { hostRoute } from "@/server/http/api";
import { getEventSummary } from "@/server/modules/reporting";

export const GET = hostRoute<{ eventId: string }>(async ({ db, user, params }) => {
  const { event: _e, ...summary } = await getEventSummary(db, user.id, params.eventId);
  return summary;
});
