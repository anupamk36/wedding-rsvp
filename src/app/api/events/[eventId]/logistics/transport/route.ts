import { hostRoute } from "@/server/http/api";
import { getTransportReport } from "@/server/modules/reporting";

export const GET = hostRoute<{ eventId: string }>(async ({ db, user, params }) => {
  const { event: _e, ...report } = await getTransportReport(db, user.id, params.eventId);
  return report;
});
