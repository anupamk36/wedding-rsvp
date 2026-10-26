import { hostRoute } from "@/server/http/api";
import { getAccommodationReport } from "@/server/modules/reporting";

export const GET = hostRoute<{ eventId: string }>(async ({ db, user, params }) => {
  const { event: _e, ...report } = await getAccommodationReport(db, user.id, params.eventId);
  return report;
});
