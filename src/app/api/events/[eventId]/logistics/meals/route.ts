import { hostRoute } from "@/server/http/api";
import { getMealReport } from "@/server/modules/reporting";

export const GET = hostRoute<{ eventId: string }>(async ({ db, user, params }) => {
  const { event: _e, activities: _a, ...report } = await getMealReport(db, user.id, params.eventId);
  return report;
});
